import { join, dirname } from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import { execa } from "execa";
import { getRepoRoot, listWorktrees, branchExists, addWorktree } from "../core/git";
import { readConfig } from "../core/config";
import { linkSharedDirs, linkEnvFiles } from "../core/links";

interface SpawnOptions {
  noShare?: boolean;
  newBranch?: boolean;
}

export async function spawn(branch: string, opts: SpawnOptions = {}): Promise<void> {
  const repoRoot = await getRepoRoot();
  const config = readConfig(repoRoot);

  const repoName = repoRoot.split("/").at(-1)!;
  const worktreePath = join(dirname(repoRoot), `${repoName}-${branch.replace(/\//g, "-")}`);

  if (existsSync(worktreePath)) {
    console.log(chalk.yellow(`Worktree already exists at ${worktreePath}`));
    return;
  }

  const trees = await listWorktrees();
  const primaryTree = trees[0];
  if (!primaryTree) throw new Error("Could not find primary worktree");

  console.log(chalk.bold(`spawning ${branch}...`));

  const exists = await branchExists(branch);
  await addWorktree(worktreePath, branch, opts.newBranch || !exists);

  if (!opts.noShare) {
    console.log(chalk.dim("linking shared dirs..."));
    linkSharedDirs(primaryTree.path, worktreePath, config);

    console.log(chalk.dim("linking env files..."));
    linkEnvFiles(primaryTree.path, worktreePath, config);
  }

  if (config.hooks.postSpawn) {
    console.log(chalk.dim(`running postSpawn hook: ${config.hooks.postSpawn}`));
    await execa(config.hooks.postSpawn, { shell: true, cwd: worktreePath, stdio: "inherit" });
  }

  console.log(`
${chalk.green("✓")} worktree ready at ${chalk.bold(worktreePath)}

  cd ${worktreePath}
`);
}
