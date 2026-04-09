import { join } from "path";
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from "fs";

const LOCK_FILENAME = "install.lock";
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface LockInfo {
  pid: number;
  timestamp: number;
  command: string;
}

function lockPath(repoRoot: string): string {
  return join(repoRoot, ".atree", LOCK_FILENAME);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(repoRoot: string, command: string): void {
  const dir = join(repoRoot, ".atree");
  mkdirSync(dir, { recursive: true });

  const path = lockPath(repoRoot);

  if (existsSync(path)) {
    try {
      const info: LockInfo = JSON.parse(readFileSync(path, "utf-8"));
      const age = Date.now() - info.timestamp;

      if (isPidAlive(info.pid) && age < STALE_THRESHOLD_MS) {
        const ageSec = Math.round(age / 1000);
        throw new Error(
          `Another install is in progress (PID ${info.pid}, started ${ageSec}s ago: "${info.command}").\n` +
          `Wait for it to finish, or delete .atree/${LOCK_FILENAME} if the process is stuck.`
        );
      }
      // Stale lock — remove it
      unlinkSync(path);
    } catch (err) {
      if (err instanceof SyntaxError) {
        // Corrupt lock file — remove it
        unlinkSync(path);
      } else {
        throw err;
      }
    }
  }

  const info: LockInfo = {
    pid: process.pid,
    timestamp: Date.now(),
    command,
  };
  writeFileSync(path, JSON.stringify(info, null, 2));
}

export function releaseLock(repoRoot: string): void {
  try {
    const path = lockPath(repoRoot);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // never throw from releaseLock
  }
}
