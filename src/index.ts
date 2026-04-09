import { program } from "commander";
import { init } from "./commands/init";
import { spawn } from "./commands/spawn";
import { kill } from "./commands/kill";
import { status } from "./commands/status";
import { dev } from "./commands/dev";
import { sync } from "./commands/sync";
import { add } from "./commands/add";
import { remove } from "./commands/remove";

program
  .name("atree")
  .description("Agent Trees — git worktrees for humans and agents")
  .version("0.1.0");

program
  .command("init")
  .description("Initialise Agent Trees in current repo")
  .action(init);

program
  .command("spawn <branch>")
  .description("Create a new worktree for a branch")
  .option("--no-share", "Skip dependency linking")
  .option("-b, --new-branch", "Create a new branch")
  .action(spawn);

program
  .command("kill <branch>")
  .description("Remove a worktree")
  .option("-f, --force", "Force removal even with uncommitted changes")
  .action(kill);

program
  .command("status")
  .description("Show all worktrees with ports and status")
  .action(status);

program
  .command("dev")
  .description("Start dev server(s) for current or all trees")
  .option("--all", "Start dev servers across all trees")
  .action(dev);

program
  .command("sync")
  .description("Re-sync shared dirs and env from primary tree")
  .action(sync);

program
  .command("add <packages...>")
  .description("Install packages safely via the primary worktree")
  .option("-D, --save-dev", "Add as a dev dependency")
  .option("-w, --workspace <path>", "Target a specific workspace package (monorepo)")
  .action((packages: string[], opts: { saveDev?: boolean; workspace?: string }) => add(packages, opts));

program
  .command("remove <packages...>")
  .description("Remove packages safely across worktrees")
  .option("-w, --workspace <path>", "Target a specific workspace package (monorepo)")
  .option("-f, --force", "Force removal even if other worktrees use the package")
  .action((packages: string[], opts: { workspace?: string; force?: boolean }) => remove(packages, opts));

program.parse();
