import chalk from "chalk";
import { getRepoRoot, listWorktrees, getCurrentBranch } from "../core/git";
import { readConfig } from "../core/config";
import { linkSharedDirs, linkEnvFiles } from "../core/links";

export async function sync(): Promise<void> {
  const repoRoot = await getRepoRoot();
  const config = readConfig(repoRoot);
  const trees = await listWorktrees();
  const primaryTree = trees[0];
  if (!primaryTree) throw new Error("Could not find primary worktree");
  const currentBranch = await getCurrentBranch();

  if (currentBranch === config.primary) {
    console.log(chalk.yellow("Nothing to sync on the primary tree"));
    return;
  }

  const currentTree = trees.find((t) => t.branch === currentBranch);
  if (!currentTree) {
    console.error(chalk.red("Could not find current worktree"));
    process.exit(1);
  }

  console.log(chalk.bold(`syncing ${currentBranch}...`));

  linkSharedDirs(primaryTree.path, currentTree.path, config);
  linkEnvFiles(primaryTree.path, currentTree.path, config);

  console.log(chalk.green("✓ sync complete"));
}
