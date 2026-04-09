import { join } from "path";
import { existsSync, copyFileSync } from "fs";
import chalk from "chalk";
import { execa } from "execa";
import { getRepoRoot, listWorktrees, getCurrentBranch } from "../core/git";
import { readConfig } from "../core/config";
import {
  detectPackageManager,
  pmAddCmd,
  lockFileNames,
  manifestFileName,
  getPMInfo,
} from "../core/package-manager";
import { acquireLock, releaseLock } from "../core/lockfile";
import { syncNodeDeps, syncManifest, detectVersionChanges } from "../core/manifest";

interface AddOptions {
  saveDev?: boolean;
  workspace?: string;
}

export async function add(packages: string[], opts: AddOptions): Promise<void> {
  const repoRoot = await getRepoRoot();
  const config = readConfig(repoRoot);
  const trees = await listWorktrees();
  const primaryTree = trees[0];
  if (!primaryTree) throw new Error("Could not find primary worktree. Run `atree init` first.");

  const currentBranch = await getCurrentBranch();
  const currentTree = trees.find(t => t.branch === currentBranch);
  const isOnPrimary = currentBranch === config.primary;

  // Determine install directory (workspace support)
  const subdir = opts.workspace ?? "";
  const installCwd = subdir ? join(primaryTree.path, subdir) : primaryTree.path;

  // Detect package manager from the install target directory
  const pm = detectPackageManager(installCwd);
  const pmInfo = getPMInfo(pm);

  const manifest = manifestFileName(pm);
  const primaryManifest = join(installCwd, manifest);

  if (!existsSync(primaryManifest)) {
    throw new Error(`No ${manifest} found at ${installCwd}`);
  }

  // Downgrade/version-change detection (Node.js only — JSON is easy to parse)
  if (pmInfo.ecosystem === "node") {
    const changes = detectVersionChanges(primaryManifest, packages);
    if (changes.length > 0) {
      console.log(chalk.yellow("\n⚠ Version changes detected (affects all worktrees):"));
      for (const c of changes) {
        console.log(chalk.yellow(`  ${c.name}: ${c.current} → ${c.requested}`));
      }
      console.log();
      // Still proceed — the PM will handle the actual install.
      // The warning lets the user know this affects all branches.
    }
  }

  const lockCommand = `atree add ${packages.join(" ")}`;
  acquireLock(primaryTree.path, lockCommand);

  try {
    // Run install in primary worktree
    const [cmd, ...args] = pmAddCmd(pm, packages, opts.saveDev ?? false);

    console.log(chalk.dim(`Installing via ${pm} in primary (${primaryTree.branch})...`));
    await execa(cmd, args, { cwd: installCwd, stdio: "inherit" });
    console.log(chalk.green("✓ Installed in primary"));

    // Sync to current worktree if not on primary
    if (!isOnPrimary && currentTree) {
      const currentCwd = subdir ? join(currentTree.path, subdir) : currentTree.path;
      const currentManifest = join(currentCwd, manifest);

      if (existsSync(currentManifest)) {
        console.log(chalk.dim("Syncing manifest to current worktree..."));

        if (pmInfo.ecosystem === "node") {
          syncNodeDeps(primaryManifest, currentManifest);
        } else {
          syncManifest(primaryManifest, currentManifest);
        }
        console.log(chalk.green(`✓ ${manifest} synced`));
      }

      // Copy lock file(s)
      for (const lockFile of lockFileNames(pm)) {
        const primaryLock = join(installCwd, lockFile);
        const currentLock = join(currentCwd, lockFile);
        if (existsSync(primaryLock)) {
          copyFileSync(primaryLock, currentLock);
        }
      }
      console.log(chalk.green("✓ Lock file synced"));
    }

    console.log(chalk.green(`\n✓ Added ${packages.join(", ")}`));
  } finally {
    releaseLock(primaryTree.path);
  }
}
