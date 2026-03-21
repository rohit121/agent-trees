import { dirname } from "path";
import chalk from "chalk";
import { getRepoRoot, listWorktrees, removeWorktree } from "../core/git";
import { readConfig } from "../core/config";
import { unlinkSharedDirs } from "../core/links";

interface KillOptions {
  force?: boolean;
}

export async function kill(branch: string, opts: KillOptions = {}): Promise<void> {
  const repoRoot = await getRepoRoot();
  const config = readConfig(repoRoot);

  if (branch === config.primary) {
    console.error(chalk.red(`Cannot kill primary branch (${config.primary})`));
    process.exit(1);
  }

  const trees = await listWorktrees();
  const repoName = repoRoot.split("/").at(-1)!;
  const expectedPath = `${dirname(repoRoot)}/${repoName}-${branch.replace(/\//g, "-")}`;

  const tree = trees.find((t) => t.branch === branch || t.path === expectedPath);
  if (!tree) {
    console.error(chalk.red(`No worktree found for branch: ${branch}`));
    process.exit(1);
  }

  unlinkSharedDirs(tree.path, config);
  await removeWorktree(tree.path, opts.force);

  console.log(chalk.green(`✓ removed worktree for ${branch}`));
}
