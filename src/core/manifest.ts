import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

/**
 * Sync Node.js package.json dependencies from source to target.
 * Overlays source's deps onto target, preserving target-only fields.
 */
export function syncNodeDeps(sourcePath: string, targetPath: string): void {
  const sourcePkg = JSON.parse(readFileSync(sourcePath, "utf-8"));
  const targetPkg = JSON.parse(readFileSync(targetPath, "utf-8"));

  if (sourcePkg.dependencies) {
    targetPkg.dependencies = {
      ...targetPkg.dependencies,
      ...sourcePkg.dependencies,
    };
  }
  if (sourcePkg.devDependencies) {
    targetPkg.devDependencies = {
      ...targetPkg.devDependencies,
      ...sourcePkg.devDependencies,
    };
  }

  writeFileSync(targetPath, JSON.stringify(targetPkg, null, 2) + "\n");
}

/**
 * Copy a manifest file from source to target (for non-JSON manifests like
 * pyproject.toml, Cargo.toml, go.mod where merging is complex).
 */
export function syncManifest(sourcePath: string, targetPath: string): void {
  copyFileSync(sourcePath, targetPath);
}

/**
 * Detect if any of the requested packages are already installed at a different
 * version (downgrade/upgrade detection for Node.js).
 */
export function detectVersionChanges(
  pkgJsonPath: string,
  packages: string[]
): Array<{ name: string; current: string; requested: string | null }> {
  if (!existsSync(pkgJsonPath)) return [];

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const changes: Array<{ name: string; current: string; requested: string | null }> = [];

  for (const spec of packages) {
    // Parse "react@17" → name="react", version="17"
    const atIdx = spec.lastIndexOf("@");
    const hasVersion = atIdx > 0; // ignore leading @ in scoped packages
    const name = hasVersion ? spec.slice(0, atIdx) : spec;
    const requested = hasVersion ? spec.slice(atIdx + 1) : null;

    if (allDeps[name] && requested) {
      const current = allDeps[name].replace(/^[\^~>=<]*/, "");
      if (current !== requested) {
        changes.push({ name, current, requested });
      }
    }
  }

  return changes;
}

/**
 * Remove packages from a Node.js package.json (deps + devDeps).
 */
export function removeFromNodeManifest(pkgJsonPath: string, packages: string[]): void {
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
export function isInNodeManifest(pkgJsonPath: string, packageName: string): boolean {
  if (!existsSync(pkgJsonPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
  return !!(pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName]);
}

/**
 * For non-Node ecosystems, check if a package name appears in the manifest file.
 * Simple text search — not perfect but good enough for warnings.
 */
export function isInManifestText(manifestPath: string, packageName: string): boolean {
  if (!existsSync(manifestPath)) return false;
  const content = readFileSync(manifestPath, "utf-8");
  return content.includes(packageName);
}

/**
 * Check which worktrees reference any of the given packages.
 */
export function findWorktreesUsing(
  packages: string[],
  trees: Array<{ path: string; branch: string }>,
  excludeBranch: string,
  manifest: string,
  ecosystem: string,
  subdir: string
): Map<string, string[]> {
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
