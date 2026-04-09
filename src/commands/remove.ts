import { join } from "path";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import chalk from "chalk";
import { execa } from "execa";
import { getRepoRoot, listWorktrees, getCurrentBranch } from "../core/git";
import { readConfig } from "../core/config";
import {
  detectPackageManager,
  pmRemoveCmd,
  lockFileNames,
  manifestFileName,
  getPMInfo,
  type PackageManager,
} from "../core/package-manager";
import { acquireLock, releaseLock } from "../core/lockfile";

interface RemoveOptions {
  workspace?: string;
  force?: boolean;
}

/**
 * Remove packages from a Node.js package.json (deps + devDeps).
 */
function removeFromNodeManifest(pkgJsonPath: string, packages: string[]): void {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  for (const name of packages) {
    if (pkg.dependencies) delete pkg.dependencies[name];
    if (pkg.devDependencies) delete pkg.devDependencies[name];
  }
  writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n");
}

/**
 * Check if a package is listed in a Node.js package.json.
 */
function isInNodeManifest(pkgJsonPath: string, packageName: string): boolean {
  if (!existsSync(pkgJsonPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  return !!(pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName]);
}

/**
 * For non-Node ecosystems, check if a package name appears in the manifest file.
 * Simple text search — not perfect but good enough for warnings.
 */
function isInManifestText(manifestPath: string, packageName: string): boolean {
  if (!existsSync(manifestPath)) return false;
  const content = readFileSync(manifestPath, "utf-8");
  return content.includes(packageName);
}

/**
 * Check which other worktrees reference any of the given packages.
 */
async function findWorktreesUsing(
  packages: string[],
  trees: Array<{ path: string; branch: string }>,
  excludeBranch: string,
  manifest: string,
  ecosystem: string,
  subdir: string
): Promise<Map<string, string[]>> {
  // Map: packageName → list of branch names that use it
  const usage = new Map<string, string[]>();

  for (const tree of trees) {
    if (tree.branch === excludeBranch) continue;
    const manifestPath = join(tree.path, subdir, manifest);

    for (const pkg of packages) {
      const isUsed = ecosystem === "node"
        ? isInNodeManifest(manifestPath, pkg)
        : isInManifestText(manifestPath, pkg);

      if (isUsed) {
        if (!usage.has(pkg)) usage.set(pkg, []);
        usage.get(pkg)!.push(tree.branch);
      }
    }
  }

  return usage;
}

export async function remove(packages: string[], opts: RemoveOptions): Promise<void> {
  const repoRoot = await getRepoRoot();
  const config = readConfig(repoRoot);
  const trees = await listWorktrees();
  const primaryTree = trees[0];
  if (!primaryTree) throw new Error("Could not find primary worktree. Run `atree init` first.");

  const currentBranch = await getCurrentBranch();
  const currentTree = trees.find(t => t.branch === currentBranch);
  const isOnPrimary = currentBranch === config.primary;

  const subdir = opts.workspace ?? "";
  const pm = detectPackageManager(subdir ? join(primaryTree.path, subdir) : primaryTree.path);
  const pmInfo = getPMInfo(pm);
  const manifest = manifestFileName(pm);

  if (isOnPrimary) {
    // === Removing from primary: dangerous, check other worktrees first ===
    const usage = await findWorktreesUsing(
      packages, trees, currentBranch, manifest, pmInfo.ecosystem, subdir
    );

    if (usage.size > 0 && !opts.force) {
      console.log(chalk.yellow("\n⚠ These packages are still used by other worktrees:"));
      for (const [pkg, branches] of usage) {
        console.log(chalk.yellow(`  ${pkg}: ${branches.join(", ")}`));
      }
      console.log(chalk.yellow(`\nRemoving from primary will break those worktrees (shared node_modules).`));
      console.log(chalk.yellow(`Use ${chalk.bold("--force")} to remove anyway.\n`));
      process.exit(1);
    }

    // Safe to actually uninstall from primary
    const lockCommand = `atree remove ${packages.join(" ")}`;
    acquireLock(primaryTree.path, lockCommand);

    try {
      const installCwd = subdir ? join(primaryTree.path, subdir) : primaryTree.path;
      const [cmd, ...args] = pmRemoveCmd(pm, packages);

      console.log(chalk.dim(`Removing via ${pm} from primary...`));
      await execa(cmd, args, { cwd: installCwd, stdio: "inherit" });
      console.log(chalk.green(`✓ Removed ${packages.join(", ")} from primary`));
    } finally {
      releaseLock(primaryTree.path);
    }
  } else {
    // === Removing from a feature branch: package.json-only ===
    // Do NOT uninstall from shared node_modules — other branches may need it.
    if (!currentTree) {
      throw new Error("Could not determine current worktree.");
    }

    const currentCwd = subdir ? join(currentTree.path, subdir) : currentTree.path;
    const currentManifest = join(currentCwd, manifest);

    if (!existsSync(currentManifest)) {
      throw new Error(`No ${manifest} found at ${currentCwd}`);
    }

    if (pmInfo.ecosystem === "node") {
      removeFromNodeManifest(currentManifest, packages);
      console.log(chalk.green(`✓ Removed ${packages.join(", ")} from ${manifest}`));
      console.log(chalk.dim(
        "Note: packages remain in shared node_modules (other branches may need them).\n" +
        "They will be pruned when this branch merges and a clean install runs."
      ));
    } else {
      // For non-Node ecosystems, we still only modify the manifest.
      // Run the PM's remove command targeting the current worktree's manifest,
      // but we need to be careful not to affect the shared directory.
      //
      // For Python (poetry/uv): the command edits pyproject.toml in cwd — safe,
      //   since .venv is symlinked and we don't want to touch it.
      //   But `poetry remove` also modifies .venv, which is shared. So we do
      //   manifest-only removal by copying the manifest, running remove, and
      //   restoring the shared dir symlink if needed.
      //
      // Simplest safe approach: copy primary's manifest to a temp location,
      // remove the packages from the current worktree's manifest only.
      // For TOML manifests we run the PM remove in the current worktree but
      // skip the actual uninstall from the shared directory.

      const lockCommand = `atree remove ${packages.join(" ")}`;
      acquireLock(primaryTree.path, lockCommand);

      try {
        const [cmd, ...args] = pmRemoveCmd(pm, packages);

        // For Python PMs that modify both manifest and venv:
        // We let the remove run (it edits the manifest in the current worktree),
        // then re-link the shared .venv from primary to undo any venv changes.
        console.log(chalk.dim(`Removing from ${manifest} in current worktree...`));
        await execa(cmd, args, { cwd: currentCwd, stdio: "inherit" });

        // Re-link the shared directory from primary if it was affected
        const { sharedDir } = pmInfo;
        if (sharedDir) {
          const { linkSharedDirs } = await import("../core/links");
          const tempConfig = { ...config, share: [subdir ? join(subdir, sharedDir) : sharedDir] };
          linkSharedDirs(primaryTree.path, currentTree.path, tempConfig as any);
        }

        console.log(chalk.green(`✓ Removed ${packages.join(", ")} from ${manifest}`));
        console.log(chalk.dim(
          `Note: packages remain in shared ${pmInfo.sharedDir || "dependencies"} (other branches may need them).`
        ));
      } finally {
        releaseLock(primaryTree.path);
      }
    }

    // Copy updated lock file from primary (it hasn't changed, but ensure consistency)
    if (currentTree) {
      const primaryCwd = subdir ? join(primaryTree.path, subdir) : primaryTree.path;
      const currentCwd2 = subdir ? join(currentTree.path, subdir) : currentTree.path;
      for (const lockFile of lockFileNames(pm)) {
        const src = join(primaryCwd, lockFile);
        const dest = join(currentCwd2, lockFile);
        if (existsSync(src)) {
          copyFileSync(src, dest);
        }
      }
    }
  }
}
