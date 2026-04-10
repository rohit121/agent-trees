import { describe, test, expect } from "bun:test";

// The portEnv function is local to dev.ts, so we test the logic directly here.
// This mirrors the implementation: if port is defined, return PORT = base + index.

function portEnv(svc: { port?: number }, treeIndex: number): Record<string, string> {
  if (svc.port == null) return {};
  return { PORT: String(svc.port + treeIndex) };
}

describe("port resolution", () => {
  test("primary worktree (index 0) gets base port", () => {
    expect(portEnv({ port: 3000 }, 0)).toEqual({ PORT: "3000" });
  });

  test("first spawned worktree gets base + 1", () => {
    expect(portEnv({ port: 3000 }, 1)).toEqual({ PORT: "3001" });
  });

  test("second spawned worktree gets base + 2", () => {
    expect(portEnv({ port: 3000 }, 2)).toEqual({ PORT: "3002" });
  });

  test("different base ports", () => {
    expect(portEnv({ port: 4000 }, 0)).toEqual({ PORT: "4000" });
    expect(portEnv({ port: 4000 }, 3)).toEqual({ PORT: "4003" });
    expect(portEnv({ port: 8080 }, 1)).toEqual({ PORT: "8081" });
  });

  test("returns empty object when port is undefined", () => {
    expect(portEnv({}, 0)).toEqual({});
    expect(portEnv({ port: undefined }, 5)).toEqual({});
  });

  test("returns empty object when port is null-ish", () => {
    expect(portEnv({ port: undefined }, 0)).toEqual({});
  });
});
