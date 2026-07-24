import { dirname, isAbsolute, relative, resolve, sep } from "path";
import { existsSync, symlinkSync, unlinkSync, cpSync, mkdirSync, realpathSync } from "fs";
import chalk from "chalk";
import type { AtreeConfig } from "./config";

function isWithin(root: string, path: string, allowRoot = false): boolean {
  const rel = relative(root, path);
  return (allowRoot || rel !== "") && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function resolveWithinRoot(root: string, configuredPath: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, configuredPath);

  if (isAbsolute(configuredPath) || !isWithin(resolvedRoot, resolvedPath)) {
    throw new Error(`Configured path must stay within its worktree: ${configuredPath}`);
  }

  const canonicalRoot = realpathSync(resolvedRoot);
  let existingParent = dirname(resolvedPath);
  while (!existsSync(existingParent)) {
    existingParent = dirname(existingParent);
  }
  const canonicalParent = realpathSync(existingParent);

  if (!isWithin(canonicalRoot, canonicalParent, true)) {
    throw new Error(`Configured path escapes its worktree through a symlink: ${configuredPath}`);
  }

  return resolve(canonicalParent, relative(existingParent, resolvedPath));
}

function resolveExistingSource(root: string, configuredPath: string): string {
  const path = resolveWithinRoot(root, configuredPath);
  const canonicalRoot = realpathSync(root);
  const canonicalPath = realpathSync(path);

  if (!isWithin(canonicalRoot, canonicalPath)) {
    throw new Error(`Configured source escapes its worktree through a symlink: ${configuredPath}`);
  }

  return canonicalPath;
}

export function linkSharedDirs(
  primaryPath: string,
  targetPath: string,
  config: AtreeConfig
): void {
  for (const dir of config.share) {
    const src = resolveWithinRoot(primaryPath, dir);
    const dest = resolveWithinRoot(targetPath, dir);

    if (!existsSync(src)) {
      console.log(chalk.yellow(`  skip ${dir} (not found in primary)`));
      continue;
    }

    const canonicalSrc = resolveExistingSource(primaryPath, dir);
    if (src === dest || canonicalSrc === dest) {
      throw new Error(`Configured source and destination are the same: ${dir}`);
    }

    // Ensure parent directory exists (needed for nested paths like apps/web/node_modules)
    mkdirSync(dirname(dest), { recursive: true });

    if (existsSync(dest)) {
      unlinkSync(dest);
    }

    try {
      symlinkSync(canonicalSrc, dest);
      console.log(chalk.green(`  linked ${dir}`));
    } catch {
      console.log(chalk.yellow(`  symlink failed for ${dir}, copying instead...`));
      cpSync(canonicalSrc, dest, { recursive: true });
      console.log(chalk.green(`  copied ${dir}`));
    }
  }
}

export function linkEnvFiles(
  primaryPath: string,
  targetPath: string,
  config: AtreeConfig
): void {
  for (const file of config.env.files) {
    const src = resolveWithinRoot(primaryPath, file);
    const dest = resolveWithinRoot(targetPath, file);

    if (!existsSync(src)) continue;

    const canonicalSrc = resolveExistingSource(primaryPath, file);
    if (src === dest || canonicalSrc === dest) {
      throw new Error(`Configured source and destination are the same: ${file}`);
    }

    mkdirSync(dirname(dest), { recursive: true });

    if (existsSync(dest)) {
      unlinkSync(dest);
    }

    try {
      symlinkSync(canonicalSrc, dest);
      console.log(chalk.green(`  linked ${file}`));
    } catch {
      console.log(chalk.yellow(`  could not link ${file}`));
    }
  }
}

export function unlinkSharedDirs(targetPath: string, config: AtreeConfig): void {
  for (const dir of config.share) {
    const dest = resolveWithinRoot(targetPath, dir);
    if (existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {
        // not a symlink, leave it
      }
    }
  }
}
