import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  detectPackageManager,
  detectAllPackageManagers,
  pmAddCmd,
  pmRemoveCmd,
  pmRunCmd,
  lockFileNames,
  manifestFileName,
  getPMInfo,
} from "../src/core/package-manager";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `atree-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// --- detectPackageManager ---

describe("detectPackageManager", () => {
  test("detects bun from bun.lock", () => {
    writeFileSync(join(testDir, "bun.lock"), "");
    expect(detectPackageManager(testDir)).toBe("bun");
  });

  test("detects bun from bun.lockb", () => {
    writeFileSync(join(testDir, "bun.lockb"), "");
    expect(detectPackageManager(testDir)).toBe("bun");
  });

  test("detects pnpm from pnpm-lock.yaml", () => {
    writeFileSync(join(testDir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(testDir)).toBe("pnpm");
  });

  test("detects yarn from yarn.lock", () => {
    writeFileSync(join(testDir, "yarn.lock"), "");
    expect(detectPackageManager(testDir)).toBe("yarn");
  });

  test("detects npm from package.json (no lock file)", () => {
    writeFileSync(join(testDir, "package.json"), "{}");
    expect(detectPackageManager(testDir)).toBe("npm");
  });

  test("detects poetry from poetry.lock", () => {
    writeFileSync(join(testDir, "poetry.lock"), "");
    expect(detectPackageManager(testDir)).toBe("poetry");
  });

  test("detects uv from uv.lock", () => {
    writeFileSync(join(testDir, "uv.lock"), "");
    expect(detectPackageManager(testDir)).toBe("uv");
  });

  test("detects pip from pyproject.toml", () => {
    writeFileSync(join(testDir, "pyproject.toml"), "");
    expect(detectPackageManager(testDir)).toBe("pip");
  });

  test("detects pip from requirements.txt", () => {
    writeFileSync(join(testDir, "requirements.txt"), "");
    expect(detectPackageManager(testDir)).toBe("pip");
  });

  test("detects cargo from Cargo.toml", () => {
    writeFileSync(join(testDir, "Cargo.toml"), "");
    expect(detectPackageManager(testDir)).toBe("cargo");
  });

  test("detects go from go.mod", () => {
    writeFileSync(join(testDir, "go.mod"), "");
    expect(detectPackageManager(testDir)).toBe("go");
  });

  test("prefers bun over npm when both lock files exist", () => {
    writeFileSync(join(testDir, "bun.lock"), "");
    writeFileSync(join(testDir, "package.json"), "{}");
    expect(detectPackageManager(testDir)).toBe("bun");
  });

  test("prefers node over python when both exist", () => {
    writeFileSync(join(testDir, "package.json"), "{}");
    writeFileSync(join(testDir, "pyproject.toml"), "");
    expect(detectPackageManager(testDir)).toBe("npm");
  });

  test("falls back to npm for empty directory", () => {
    expect(detectPackageManager(testDir)).toBe("npm");
  });
});

// --- detectAllPackageManagers ---

describe("detectAllPackageManagers", () => {
  test("detects multiple ecosystems", () => {
    writeFileSync(join(testDir, "bun.lock"), "");
    writeFileSync(join(testDir, "pyproject.toml"), "");
    writeFileSync(join(testDir, "go.mod"), "");

    const results = detectAllPackageManagers(testDir);
    const ecosystems = results.map(r => r.ecosystem);

    expect(ecosystems).toContain("node");
    expect(ecosystems).toContain("python");
    expect(ecosystems).toContain("go");
    expect(results.length).toBe(3);
  });

  test("returns one PM per ecosystem", () => {
    writeFileSync(join(testDir, "bun.lock"), "");
    writeFileSync(join(testDir, "yarn.lock"), ""); // same ecosystem, should be ignored

    const results = detectAllPackageManagers(testDir);
    expect(results.length).toBe(1);
    expect(results[0]!.pm).toBe("bun"); // bun wins because checked first
  });

  test("returns empty for dir with no project files", () => {
    const results = detectAllPackageManagers(testDir);
    expect(results.length).toBe(0);
  });
});

// --- pmAddCmd ---

describe("pmAddCmd", () => {
  test("bun add", () => {
    expect(pmAddCmd("bun", ["stripe"], false)).toEqual(["bun", "add", "stripe"]);
  });

  test("bun add -d (dev)", () => {
    expect(pmAddCmd("bun", ["vitest"], true)).toEqual(["bun", "add", "-d", "vitest"]);
  });

  test("npm install", () => {
    expect(pmAddCmd("npm", ["express"], false)).toEqual(["npm", "install", "express"]);
  });

  test("npm install --save-dev", () => {
    expect(pmAddCmd("npm", ["jest"], true)).toEqual(["npm", "install", "--save-dev", "jest"]);
  });

  test("pnpm add", () => {
    expect(pmAddCmd("pnpm", ["lodash"], false)).toEqual(["pnpm", "add", "lodash"]);
  });

  test("yarn add --dev", () => {
    expect(pmAddCmd("yarn", ["typescript"], true)).toEqual(["yarn", "add", "--dev", "typescript"]);
  });

  test("poetry add", () => {
    expect(pmAddCmd("poetry", ["requests"], false)).toEqual(["poetry", "add", "requests"]);
  });

  test("poetry add --group dev", () => {
    expect(pmAddCmd("poetry", ["pytest"], true)).toEqual(["poetry", "add", "--group", "dev", "pytest"]);
  });

  test("uv add", () => {
    expect(pmAddCmd("uv", ["flask"], false)).toEqual(["uv", "add", "flask"]);
  });

  test("uv add --dev", () => {
    expect(pmAddCmd("uv", ["ruff"], true)).toEqual(["uv", "add", "--dev", "ruff"]);
  });

  test("cargo add", () => {
    expect(pmAddCmd("cargo", ["serde"], false)).toEqual(["cargo", "add", "serde"]);
  });

  test("cargo add --dev", () => {
    expect(pmAddCmd("cargo", ["tokio-test"], true)).toEqual(["cargo", "add", "--dev", "tokio-test"]);
  });

  test("go get", () => {
    expect(pmAddCmd("go", ["github.com/gin-gonic/gin"], false)).toEqual(["go", "get", "github.com/gin-gonic/gin"]);
  });

  test("pip install (ignores dev flag)", () => {
    expect(pmAddCmd("pip", ["flask"], true)).toEqual(["pip", "install", "flask"]);
  });

  test("multiple packages", () => {
    expect(pmAddCmd("bun", ["react", "react-dom", "@types/react"], false))
      .toEqual(["bun", "add", "react", "react-dom", "@types/react"]);
  });
});

// --- pmRemoveCmd ---

describe("pmRemoveCmd", () => {
  test("bun remove", () => {
    expect(pmRemoveCmd("bun", ["chalk"])).toEqual(["bun", "remove", "chalk"]);
  });

  test("npm uninstall", () => {
    expect(pmRemoveCmd("npm", ["chalk"])).toEqual(["npm", "uninstall", "chalk"]);
  });

  test("pnpm remove", () => {
    expect(pmRemoveCmd("pnpm", ["chalk"])).toEqual(["pnpm", "remove", "chalk"]);
  });

  test("yarn remove", () => {
    expect(pmRemoveCmd("yarn", ["chalk"])).toEqual(["yarn", "remove", "chalk"]);
  });

  test("poetry remove", () => {
    expect(pmRemoveCmd("poetry", ["requests"])).toEqual(["poetry", "remove", "requests"]);
  });

  test("uv remove", () => {
    expect(pmRemoveCmd("uv", ["flask"])).toEqual(["uv", "remove", "flask"]);
  });

  test("pip uninstall -y", () => {
    expect(pmRemoveCmd("pip", ["flask"])).toEqual(["pip", "uninstall", "-y", "flask"]);
  });

  test("cargo remove", () => {
    expect(pmRemoveCmd("cargo", ["serde"])).toEqual(["cargo", "remove", "serde"]);
  });

  test("go get @none", () => {
    expect(pmRemoveCmd("go", ["github.com/gin-gonic/gin"]))
      .toEqual(["go", "get", "github.com/gin-gonic/gin@none"]);
  });
});

// --- pmRunCmd ---

describe("pmRunCmd", () => {
  test("bun run dev", () => {
    expect(pmRunCmd("bun", "dev")).toBe("bun run dev");
  });

  test("pnpm dev", () => {
    expect(pmRunCmd("pnpm", "dev")).toBe("pnpm dev");
  });

  test("yarn dev", () => {
    expect(pmRunCmd("yarn", "dev")).toBe("yarn dev");
  });

  test("npm run dev", () => {
    expect(pmRunCmd("npm", "dev")).toBe("npm run dev");
  });
});

// --- lockFileNames ---

describe("lockFileNames", () => {
  test("bun lock files", () => {
    expect(lockFileNames("bun")).toEqual(["bun.lock", "bun.lockb"]);
  });

  test("npm lock file", () => {
    expect(lockFileNames("npm")).toEqual(["package-lock.json"]);
  });

  test("poetry lock file", () => {
    expect(lockFileNames("poetry")).toEqual(["poetry.lock"]);
  });

  test("cargo lock file", () => {
    expect(lockFileNames("cargo")).toEqual(["Cargo.lock"]);
  });
});

// --- manifestFileName ---

describe("manifestFileName", () => {
  test("node ecosystem", () => {
    expect(manifestFileName("bun")).toBe("package.json");
    expect(manifestFileName("npm")).toBe("package.json");
    expect(manifestFileName("pnpm")).toBe("package.json");
    expect(manifestFileName("yarn")).toBe("package.json");
  });

  test("python ecosystem", () => {
    expect(manifestFileName("poetry")).toBe("pyproject.toml");
    expect(manifestFileName("uv")).toBe("pyproject.toml");
    expect(manifestFileName("pip")).toBe("pyproject.toml");
  });

  test("rust ecosystem", () => {
    expect(manifestFileName("cargo")).toBe("Cargo.toml");
  });

  test("go ecosystem", () => {
    expect(manifestFileName("go")).toBe("go.mod");
  });
});

// --- getPMInfo ---

describe("getPMInfo", () => {
  test("returns correct info for bun", () => {
    const info = getPMInfo("bun");
    expect(info.pm).toBe("bun");
    expect(info.ecosystem).toBe("node");
    expect(info.sharedDir).toBe("node_modules");
  });

  test("returns correct info for poetry", () => {
    const info = getPMInfo("poetry");
    expect(info.pm).toBe("poetry");
    expect(info.ecosystem).toBe("python");
    expect(info.sharedDir).toBe(".venv");
  });

  test("returns correct info for cargo", () => {
    const info = getPMInfo("cargo");
    expect(info.pm).toBe("cargo");
    expect(info.ecosystem).toBe("rust");
    expect(info.sharedDir).toBe("target");
  });
});
