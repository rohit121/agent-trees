import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { acquireLock, releaseLock } from "../src/core/lockfile";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `atree-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("acquireLock", () => {
  test("creates lock file in .atree directory", () => {
    acquireLock(testDir, "atree add chalk");

    const lockPath = join(testDir, ".atree", "install.lock");
    expect(existsSync(lockPath)).toBe(true);

    const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    expect(lock.pid).toBe(process.pid);
    expect(lock.command).toBe("atree add chalk");
    expect(typeof lock.timestamp).toBe("number");
  });

  test("creates .atree directory if it does not exist", () => {
    const atreeDir = join(testDir, ".atree");
    expect(existsSync(atreeDir)).toBe(false);

    acquireLock(testDir, "test");

    expect(existsSync(atreeDir)).toBe(true);
  });

  test("throws when lock is held by a live process", () => {
    // First acquire succeeds
    acquireLock(testDir, "first command");

    // Second acquire should fail (same PID is alive)
    expect(() => {
      acquireLock(testDir, "second command");
    }).toThrow(/Another install is in progress/);
  });

  test("cleans up stale lock from dead process", () => {
    // Write a lock with a non-existent PID
    const atreeDir = join(testDir, ".atree");
    mkdirSync(atreeDir, { recursive: true });
    writeFileSync(join(atreeDir, "install.lock"), JSON.stringify({
      pid: 999999999, // very unlikely to be alive
      timestamp: Date.now(),
      command: "stale command",
    }));

    // Should succeed since the PID is dead
    acquireLock(testDir, "new command");

    const lock = JSON.parse(readFileSync(join(atreeDir, "install.lock"), "utf-8"));
    expect(lock.command).toBe("new command");
    expect(lock.pid).toBe(process.pid);
  });

  test("cleans up lock older than 5 minutes", () => {
    const atreeDir = join(testDir, ".atree");
    mkdirSync(atreeDir, { recursive: true });
    writeFileSync(join(atreeDir, "install.lock"), JSON.stringify({
      pid: process.pid, // alive, but stale
      timestamp: Date.now() - 6 * 60 * 1000, // 6 minutes ago
      command: "old command",
    }));

    // Should succeed since the lock is stale
    acquireLock(testDir, "new command");

    const lock = JSON.parse(readFileSync(join(atreeDir, "install.lock"), "utf-8"));
    expect(lock.command).toBe("new command");
  });

  test("cleans up corrupt lock file", () => {
    const atreeDir = join(testDir, ".atree");
    mkdirSync(atreeDir, { recursive: true });
    writeFileSync(join(atreeDir, "install.lock"), "not json {{{");

    // Should succeed after cleaning up corrupt file
    acquireLock(testDir, "new command");

    const lock = JSON.parse(readFileSync(join(atreeDir, "install.lock"), "utf-8"));
    expect(lock.command).toBe("new command");
  });
});

describe("releaseLock", () => {
  test("removes existing lock file", () => {
    acquireLock(testDir, "test");
    const lockPath = join(testDir, ".atree", "install.lock");
    expect(existsSync(lockPath)).toBe(true);

    releaseLock(testDir);
    expect(existsSync(lockPath)).toBe(false);
  });

  test("does not throw when no lock file exists", () => {
    expect(() => releaseLock(testDir)).not.toThrow();
  });

  test("does not throw when .atree directory does not exist", () => {
    const nonExistent = join(testDir, "nonexistent");
    expect(() => releaseLock(nonExistent)).not.toThrow();
  });
});
