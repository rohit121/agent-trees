import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  syncNodeDeps,
  syncManifest,
  detectVersionChanges,
  removeFromNodeManifest,
  isInNodeManifest,
  isInManifestText,
  findWorktreesUsing,
} from "../src/core/manifest";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `atree-manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// --- syncNodeDeps ---

describe("syncNodeDeps", () => {
  test("overlays source dependencies onto target", () => {
    const source = join(testDir, "source.json");
    const target = join(testDir, "target.json");

    writeFileSync(source, JSON.stringify({
      name: "primary",
      dependencies: { react: "^18.0.0", stripe: "^12.0.0" },
    }));
    writeFileSync(target, JSON.stringify({
      name: "feature-branch",
      dependencies: { react: "^17.0.0" },
    }));

    syncNodeDeps(source, target);

    const result = JSON.parse(readFileSync(target, "utf-8"));
    expect(result.name).toBe("feature-branch"); // preserved
    expect(result.dependencies.react).toBe("^18.0.0"); // updated from source
    expect(result.dependencies.stripe).toBe("^12.0.0"); // added from source
  });

  test("preserves target-only dependencies", () => {
    const source = join(testDir, "source.json");
    const target = join(testDir, "target.json");

    writeFileSync(source, JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));
    writeFileSync(target, JSON.stringify({
      dependencies: { react: "^17.0.0", lodash: "^4.0.0" },
    }));

    syncNodeDeps(source, target);

    const result = JSON.parse(readFileSync(target, "utf-8"));
    expect(result.dependencies.lodash).toBe("^4.0.0"); // target-only, preserved
    expect(result.dependencies.react).toBe("^18.0.0"); // source wins
  });

  test("syncs devDependencies", () => {
    const source = join(testDir, "source.json");
    const target = join(testDir, "target.json");

    writeFileSync(source, JSON.stringify({
      devDependencies: { vitest: "^1.0.0" },
    }));
    writeFileSync(target, JSON.stringify({
      devDependencies: { jest: "^29.0.0" },
    }));

    syncNodeDeps(source, target);

    const result = JSON.parse(readFileSync(target, "utf-8"));
    expect(result.devDependencies.vitest).toBe("^1.0.0");
    expect(result.devDependencies.jest).toBe("^29.0.0");
  });

  test("handles target with no dependencies field", () => {
    const source = join(testDir, "source.json");
    const target = join(testDir, "target.json");

    writeFileSync(source, JSON.stringify({
      dependencies: { stripe: "^12.0.0" },
    }));
    writeFileSync(target, JSON.stringify({ name: "bare" }));

    syncNodeDeps(source, target);

    const result = JSON.parse(readFileSync(target, "utf-8"));
    expect(result.dependencies.stripe).toBe("^12.0.0");
    expect(result.name).toBe("bare");
  });

  test("preserves non-dependency fields (scripts, name, version)", () => {
    const source = join(testDir, "source.json");
    const target = join(testDir, "target.json");

    writeFileSync(source, JSON.stringify({
      name: "primary",
      scripts: { dev: "bun run dev" },
      dependencies: { stripe: "^12.0.0" },
    }));
    writeFileSync(target, JSON.stringify({
      name: "feature",
      version: "1.0.0",
      scripts: { dev: "npm run dev", test: "jest" },
      dependencies: {},
    }));

    syncNodeDeps(source, target);

    const result = JSON.parse(readFileSync(target, "utf-8"));
    expect(result.name).toBe("feature"); // not overwritten
    expect(result.version).toBe("1.0.0");
    expect(result.scripts.test).toBe("jest"); // preserved
    expect(result.dependencies.stripe).toBe("^12.0.0");
  });
});

// --- syncManifest ---

describe("syncManifest", () => {
  test("copies file contents exactly", () => {
    const source = join(testDir, "pyproject.toml");
    const target = join(testDir, "target.toml");

    const content = '[tool.poetry]\nname = "myapp"\n\n[tool.poetry.dependencies]\nflask = "^3.0"\n';
    writeFileSync(source, content);
    writeFileSync(target, "old content");

    syncManifest(source, target);

    expect(readFileSync(target, "utf-8")).toBe(content);
  });
});

// --- detectVersionChanges ---

describe("detectVersionChanges", () => {
  test("detects downgrade", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.2.0" },
    }));

    const changes = detectVersionChanges(pkgJson, ["react@17"]);
    expect(changes.length).toBe(1);
    expect(changes[0]!.name).toBe("react");
    expect(changes[0]!.current).toBe("18.2.0");
    expect(changes[0]!.requested).toBe("17");
  });

  test("detects upgrade", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^17.0.0" },
    }));

    const changes = detectVersionChanges(pkgJson, ["react@19"]);
    expect(changes.length).toBe(1);
    expect(changes[0]!.requested).toBe("19");
  });

  test("no change when versions match", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    const changes = detectVersionChanges(pkgJson, ["react@18.0.0"]);
    expect(changes.length).toBe(0);
  });

  test("ignores packages without explicit version", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    const changes = detectVersionChanges(pkgJson, ["react"]);
    expect(changes.length).toBe(0);
  });

  test("ignores packages not currently installed", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    const changes = detectVersionChanges(pkgJson, ["stripe@12"]);
    expect(changes.length).toBe(0);
  });

  test("handles scoped packages", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { "@stripe/stripe-js": "^1.0.0" },
    }));

    const changes = detectVersionChanges(pkgJson, ["@stripe/stripe-js@2.0.0"]);
    expect(changes.length).toBe(1);
    expect(changes[0]!.name).toBe("@stripe/stripe-js");
    expect(changes[0]!.requested).toBe("2.0.0");
  });

  test("checks devDependencies too", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      devDependencies: { vitest: "^1.0.0" },
    }));

    const changes = detectVersionChanges(pkgJson, ["vitest@2.0.0"]);
    expect(changes.length).toBe(1);
  });

  test("returns empty for missing package.json", () => {
    const changes = detectVersionChanges(join(testDir, "nonexistent.json"), ["react@17"]);
    expect(changes.length).toBe(0);
  });

  test("strips version prefixes (^, ~, >=)", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: {
        a: "~1.2.3",
        b: ">=2.0.0",
        c: "^3.0.0",
      },
    }));

    const changes = detectVersionChanges(pkgJson, ["a@1.2.3", "b@2.0.0", "c@4.0.0"]);
    // a and b match after stripping, only c is a change
    expect(changes.length).toBe(1);
    expect(changes[0]!.name).toBe("c");
  });
});

// --- removeFromNodeManifest ---

describe("removeFromNodeManifest", () => {
  test("removes from dependencies", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.0.0", stripe: "^12.0.0" },
    }));

    removeFromNodeManifest(pkgJson, ["stripe"]);

    const result = JSON.parse(readFileSync(pkgJson, "utf-8"));
    expect(result.dependencies.react).toBe("^18.0.0");
    expect(result.dependencies.stripe).toBeUndefined();
  });

  test("removes from devDependencies", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      devDependencies: { vitest: "^1.0.0", jest: "^29.0.0" },
    }));

    removeFromNodeManifest(pkgJson, ["jest"]);

    const result = JSON.parse(readFileSync(pkgJson, "utf-8"));
    expect(result.devDependencies.vitest).toBe("^1.0.0");
    expect(result.devDependencies.jest).toBeUndefined();
  });

  test("removes from both deps and devDeps", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { stripe: "^12.0.0" },
      devDependencies: { stripe: "^12.0.0" },
    }));

    removeFromNodeManifest(pkgJson, ["stripe"]);

    const result = JSON.parse(readFileSync(pkgJson, "utf-8"));
    expect(result.dependencies.stripe).toBeUndefined();
    expect(result.devDependencies.stripe).toBeUndefined();
  });

  test("removes multiple packages at once", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { a: "1", b: "2", c: "3" },
    }));

    removeFromNodeManifest(pkgJson, ["a", "c"]);

    const result = JSON.parse(readFileSync(pkgJson, "utf-8"));
    expect(result.dependencies.a).toBeUndefined();
    expect(result.dependencies.b).toBe("2");
    expect(result.dependencies.c).toBeUndefined();
  });

  test("handles package not found (no-op)", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    removeFromNodeManifest(pkgJson, ["nonexistent"]);

    const result = JSON.parse(readFileSync(pkgJson, "utf-8"));
    expect(result.dependencies.react).toBe("^18.0.0");
  });
});

// --- isInNodeManifest ---

describe("isInNodeManifest", () => {
  test("finds package in dependencies", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    expect(isInNodeManifest(pkgJson, "react")).toBe(true);
  });

  test("finds package in devDependencies", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      devDependencies: { vitest: "^1.0.0" },
    }));

    expect(isInNodeManifest(pkgJson, "vitest")).toBe(true);
  });

  test("returns false for missing package", () => {
    const pkgJson = join(testDir, "package.json");
    writeFileSync(pkgJson, JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    expect(isInNodeManifest(pkgJson, "stripe")).toBe(false);
  });

  test("returns false for nonexistent file", () => {
    expect(isInNodeManifest(join(testDir, "nope.json"), "react")).toBe(false);
  });
});

// --- isInManifestText ---

describe("isInManifestText", () => {
  test("finds package name in TOML manifest", () => {
    const manifest = join(testDir, "pyproject.toml");
    writeFileSync(manifest, '[tool.poetry.dependencies]\nflask = "^3.0"\nrequests = "^2.31"\n');

    expect(isInManifestText(manifest, "flask")).toBe(true);
    expect(isInManifestText(manifest, "requests")).toBe(true);
  });

  test("returns false when package not found", () => {
    const manifest = join(testDir, "pyproject.toml");
    writeFileSync(manifest, '[tool.poetry.dependencies]\nflask = "^3.0"\n');

    expect(isInManifestText(manifest, "django")).toBe(false);
  });

  test("returns false for nonexistent file", () => {
    expect(isInManifestText(join(testDir, "nope.toml"), "flask")).toBe(false);
  });
});

// --- findWorktreesUsing ---

describe("findWorktreesUsing", () => {
  test("finds packages used across Node worktrees", () => {
    // Set up two fake worktree directories with package.json
    const treeA = join(testDir, "tree-a");
    const treeB = join(testDir, "tree-b");
    mkdirSync(treeA);
    mkdirSync(treeB);

    writeFileSync(join(treeA, "package.json"), JSON.stringify({
      dependencies: { stripe: "^12.0.0", react: "^18.0.0" },
    }));
    writeFileSync(join(treeB, "package.json"), JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    const trees = [
      { path: treeA, branch: "feature-a" },
      { path: treeB, branch: "feature-b" },
    ];

    const usage = findWorktreesUsing(
      ["stripe", "react"], trees, "main", "package.json", "node", ""
    );

    expect(usage.get("stripe")).toEqual(["feature-a"]);
    expect(usage.get("react")).toEqual(["feature-a", "feature-b"]);
  });

  test("excludes the specified branch", () => {
    const treeA = join(testDir, "tree-a");
    mkdirSync(treeA);
    writeFileSync(join(treeA, "package.json"), JSON.stringify({
      dependencies: { stripe: "^12.0.0" },
    }));

    const trees = [{ path: treeA, branch: "feature-a" }];

    const usage = findWorktreesUsing(
      ["stripe"], trees, "feature-a", "package.json", "node", ""
    );

    expect(usage.size).toBe(0);
  });

  test("handles workspace subdirectory", () => {
    const tree = join(testDir, "tree");
    mkdirSync(join(tree, "apps", "web"), { recursive: true });
    writeFileSync(join(tree, "apps", "web", "package.json"), JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    const trees = [{ path: tree, branch: "feature" }];

    const usage = findWorktreesUsing(
      ["react"], trees, "main", "package.json", "node", "apps/web"
    );

    expect(usage.get("react")).toEqual(["feature"]);
  });

  test("works with non-node ecosystem (text search)", () => {
    const tree = join(testDir, "tree");
    mkdirSync(tree);
    writeFileSync(join(tree, "pyproject.toml"), '[tool.poetry.dependencies]\nflask = "^3.0"\n');

    const trees = [{ path: tree, branch: "feature" }];

    const usage = findWorktreesUsing(
      ["flask", "django"], trees, "main", "pyproject.toml", "python", ""
    );

    expect(usage.get("flask")).toEqual(["feature"]);
    expect(usage.has("django")).toBe(false);
  });

  test("returns empty map when no worktrees use the packages", () => {
    const tree = join(testDir, "tree");
    mkdirSync(tree);
    writeFileSync(join(tree, "package.json"), JSON.stringify({
      dependencies: { react: "^18.0.0" },
    }));

    const trees = [{ path: tree, branch: "feature" }];

    const usage = findWorktreesUsing(
      ["stripe"], trees, "main", "package.json", "node", ""
    );

    expect(usage.size).toBe(0);
  });
});
