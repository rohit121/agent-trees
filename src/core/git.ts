import { execa } from "execa";

export interface WorktreeEntry {
  path: string;
  branch: string;
  isMain: boolean;
  head: string;
}

export async function getRepoRoot(): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
  return stdout.trim();
}

export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execa("git", ["branch", "--show-current"]);
  return stdout.trim();
}

export async function listWorktrees(): Promise<WorktreeEntry[]> {
  const { stdout } = await execa("git", ["worktree", "list", "--porcelain"]);
  const entries: WorktreeEntry[] = [];
  const blocks = stdout.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const worktree: Partial<WorktreeEntry> = {};

    for (const line of lines) {
      if (line.startsWith("worktree ")) worktree.path = line.slice(9);
      else if (line.startsWith("HEAD ")) worktree.head = line.slice(5);
      else if (line.startsWith("branch ")) {
        worktree.branch = line.slice(7).replace("refs/heads/", "");
      } else if (line === "bare") {
        worktree.branch = "(bare)";
      }
    }

    if (worktree.path) {
      entries.push({
        path: worktree.path!,
        branch: worktree.branch ?? "(detached)",
        head: worktree.head ?? "",
        isMain: entries.length === 0,
      });
    }
  }

  return entries;
}

export async function addWorktree(path: string, branch: string, newBranch = false): Promise<void> {
  const args = newBranch
    ? ["worktree", "add", "-b", branch, path]
    : ["worktree", "add", path, branch];
  await execa("git", args, { stdio: "inherit" });
}

export async function removeWorktree(path: string, force = false): Promise<void> {
  const args = force
    ? ["worktree", "remove", "--force", path]
    : ["worktree", "remove", path];
  await execa("git", args);
}

export async function branchExists(branch: string): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--verify", branch]);
    return true;
  } catch {
    return false;
  }
}

export async function getChangedFiles(worktreePath: string): Promise<number> {
  try {
    const { stdout } = await execa("git", ["-C", worktreePath, "status", "--porcelain"]);
    return stdout.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

export async function checkGitVersion(): Promise<void> {
  const { stdout } = await execa("git", ["--version"]);
  const match = stdout.match(/git version (\d+)\.(\d+)/);
  if (!match) return;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < 2 || (major === 2 && minor < 25)) {
    throw new Error(`atree requires git >= 2.25, found ${stdout.trim()}`);
  }
}
