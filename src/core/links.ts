import { join } from "path";
import { existsSync, symlinkSync, unlinkSync, cpSync } from "fs";
import chalk from "chalk";
import type { AtreeConfig } from "./config";

export function linkSharedDirs(
  primaryPath: string,
  targetPath: string,
  config: AtreeConfig
): void {
  for (const dir of config.share) {
    const src = join(primaryPath, dir);
    const dest = join(targetPath, dir);

    if (!existsSync(src)) {
      console.log(chalk.yellow(`  skip ${dir} (not found in primary)`));
      continue;
    }

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
    const src = join(primaryPath, file);
    const dest = join(targetPath, file);

    if (!existsSync(src)) continue;

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
    const dest = join(targetPath, dir);
    if (existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {
        // not a symlink, leave it
      }
    }
  }
}
