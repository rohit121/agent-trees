import { join, dirname, resolve, relative, isAbsolute } from "path";
import { existsSync, symlinkSync, unlinkSync, cpSync, mkdirSync } from "fs";
import chalk from "chalk";
import type { AtreeConfig } from "./config";

/**
 * Join a repository-config-supplied relative path onto a base directory and
 * refuse anything that escapes it.
 *
 * `config.share` and `config.env.files` come from `.atree` config in the
 * repository, so they are attacker-controlled for any repo you check out. A
 * plain `join()` happily resolves `../../.ssh/id_rsa`, which then gets
 * symlinked or copied into (or out of) the worktree. Resolving both sides and
 * comparing the relative path is the check that actually holds: it collapses
 * `..` segments before the comparison, and rejects absolute inputs outright.
 */
function safeJoin(baseDir: string, candidate: string): string | null {
  if (isAbsolute(candidate)) return null;
  const base = resolve(baseDir);
  const target = resolve(base, candidate);
  const rel = relative(base, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return target;
}

export function linkSharedDirs(
  primaryPath: string,
  targetPath: string,
  config: AtreeConfig
): void {
  for (const dir of config.share) {
    const src = safeJoin(primaryPath, dir);
    const dest = safeJoin(targetPath, dir);

    if (src === null || dest === null) {
      console.log(chalk.red(`  refused ${dir} (path escapes the worktree)`));
      continue;
    }

    if (!existsSync(src)) {
      console.log(chalk.yellow(`  skip ${dir} (not found in primary)`));
      continue;
    }

    // Ensure parent directory exists (needed for nested paths like apps/web/node_modules)
    mkdirSync(dirname(dest), { recursive: true });

    if (existsSync(dest)) {
      unlinkSync(dest);
    }

    try {
      symlinkSync(src, dest);
      console.log(chalk.green(`  linked ${dir}`));
    } catch {
      console.log(chalk.yellow(`  symlink failed for ${dir}, copying instead...`));
      cpSync(src, dest, { recursive: true });
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
    const src = safeJoin(primaryPath, file);
    const dest = safeJoin(targetPath, file);

    if (src === null || dest === null) {
      console.log(chalk.red(`  refused ${file} (path escapes the worktree)`));
      continue;
    }

    if (!existsSync(src)) continue;

    mkdirSync(dirname(dest), { recursive: true });

    if (existsSync(dest)) {
      unlinkSync(dest);
    }

    try {
      symlinkSync(src, dest);
      console.log(chalk.green(`  linked ${file}`));
    } catch {
      console.log(chalk.yellow(`  could not link ${file}`));
    }
  }
}

export function unlinkSharedDirs(targetPath: string, config: AtreeConfig): void {
  for (const dir of config.share) {
    const dest = safeJoin(targetPath, dir);
    if (dest !== null && existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {
        // not a symlink, leave it
      }
    }
  }
}
