import { join, dirname } from "path";
import { existsSync } from "fs";
import * as readline from "readline";
import chalk from "chalk";
import { execa } from "execa";
import { getRepoRoot, listWorktrees, branchExists, addWorktree } from "../core/git";
import { readConfig } from "../core/config";
import { linkSharedDirs, linkEnvFiles } from "../core/links";

interface SpawnOptions {
  noShare?: boolean;
  newBranch?: boolean;
}

async function approveHook(command: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) =>
      rl.question(`Run repository-defined postSpawn hook?\n  ${JSON.stringify(command)}\n(y/N) `, resolve),
    );
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
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
    if (await approveHook(config.hooks.postSpawn)) {
      await execa(config.hooks.postSpawn, { shell: true, cwd: worktreePath, stdio: "inherit" });
    } else {
      console.log(chalk.dim("skipping unapproved postSpawn hook"));
    }
  }

  console.log(`
${chalk.green("✓")} worktree ready at ${chalk.bold(worktreePath)}

  cd ${worktreePath}
`);
}
