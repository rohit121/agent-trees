import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const WORKTREE_ROOT = "/var/lib/agent-trees/worktrees"

/**
 * Removes a git worktree for the given branch. `branch` comes from the
 * remote-control request body.
 */
export function pruneWorktree(branch: string): string {
	// Sink: branch is interpolated into a shell command without escaping —
	// `foo; rm -rf /` style payloads execute.
	return execSync(`git worktree remove ${branch}`, {
		cwd: WORKTREE_ROOT,
	}).toString()
}

/**
 * Reads a worktree's log file. `file` is the log name from the request query.
 */
export function readWorktreeLog(file: string): string {
	// Sink: no containment check — `../../../../etc/passwd` escapes WORKTREE_ROOT.
	const target = path.join(WORKTREE_ROOT, "logs", file)
	return fs.readFileSync(target, "utf8")
}
