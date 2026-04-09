import { join } from "path";
import { existsSync } from "fs";

export type PackageManager =
  | "bun" | "pnpm" | "yarn" | "npm"     // Node.js
  | "poetry" | "uv" | "pip"              // Python
  | "cargo"                               // Rust
  | "go";                                 // Go

export type Ecosystem = "node" | "python" | "rust" | "go";

export interface PMInfo {
  pm: PackageManager;
  ecosystem: Ecosystem;
  lockFiles: string[];
  sharedDir: string;    // e.g. "node_modules", ".venv", "vendor"
}

const PM_REGISTRY: Record<PackageManager, Omit<PMInfo, "pm">> = {
  bun:    { ecosystem: "node",   lockFiles: ["bun.lock", "bun.lockb"],     sharedDir: "node_modules" },
  pnpm:   { ecosystem: "node",   lockFiles: ["pnpm-lock.yaml"],            sharedDir: "node_modules" },
  yarn:   { ecosystem: "node",   lockFiles: ["yarn.lock"],                 sharedDir: "node_modules" },
  npm:    { ecosystem: "node",   lockFiles: ["package-lock.json"],         sharedDir: "node_modules" },
  poetry: { ecosystem: "python", lockFiles: ["poetry.lock"],               sharedDir: ".venv" },
  uv:     { ecosystem: "python", lockFiles: ["uv.lock"],                   sharedDir: ".venv" },
  pip:    { ecosystem: "python", lockFiles: ["requirements.txt"],          sharedDir: ".venv" },
  cargo:  { ecosystem: "rust",   lockFiles: ["Cargo.lock"],               sharedDir: "target" },
  go:     { ecosystem: "go",     lockFiles: ["go.sum"],                   sharedDir: "" },
};

/**
 * Detect the package manager for a given root directory.
 * Checks lock files in priority order within each ecosystem.
 * Returns all detected PMs (one per ecosystem) when `all` is true.
 */
export function detectPackageManager(repoRoot: string): PackageManager {
  // Node.js detection (same order as original init.ts)
  if (existsSync(join(repoRoot, "bun.lockb")) || existsSync(join(repoRoot, "bun.lock"))) return "bun";
  if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoRoot, "yarn.lock"))) return "yarn";
  // Fall back to npm if package.json exists
  if (existsSync(join(repoRoot, "package.json"))) return "npm";

  // Python detection
  if (existsSync(join(repoRoot, "poetry.lock"))) return "poetry";
  if (existsSync(join(repoRoot, "uv.lock"))) return "uv";
  if (existsSync(join(repoRoot, "Pipfile.lock")) || existsSync(join(repoRoot, "Pipfile"))) return "pip";
  if (existsSync(join(repoRoot, "pyproject.toml")) || existsSync(join(repoRoot, "requirements.txt"))) return "pip";

  // Rust detection
  if (existsSync(join(repoRoot, "Cargo.toml"))) return "cargo";

  // Go detection
  if (existsSync(join(repoRoot, "go.mod"))) return "go";

  return "npm"; // last resort fallback
}

/**
 * Detect all ecosystems present in a directory.
 * Returns one PM per ecosystem found.
 */
export function detectAllPackageManagers(repoRoot: string): PMInfo[] {
  const results: PMInfo[] = [];
  const seen = new Set<Ecosystem>();

  const checks: Array<{ pm: PackageManager; files: string[] }> = [
    { pm: "bun",    files: ["bun.lockb", "bun.lock"] },
    { pm: "pnpm",   files: ["pnpm-lock.yaml"] },
    { pm: "yarn",   files: ["yarn.lock"] },
    { pm: "npm",    files: ["package-lock.json", "package.json"] },
    { pm: "poetry", files: ["poetry.lock"] },
    { pm: "uv",     files: ["uv.lock"] },
    { pm: "pip",    files: ["pyproject.toml", "requirements.txt", "Pipfile", "Pipfile.lock"] },
    { pm: "cargo",  files: ["Cargo.toml"] },
    { pm: "go",     files: ["go.mod"] },
  ];

  for (const { pm, files } of checks) {
    const info = PM_REGISTRY[pm];
    if (seen.has(info.ecosystem)) continue;
    if (files.some(f => existsSync(join(repoRoot, f)))) {
      seen.add(info.ecosystem);
      results.push({ pm, ...info });
    }
  }

  return results;
}

export function getPMInfo(pm: PackageManager): PMInfo {
  return { pm, ...PM_REGISTRY[pm] };
}

/**
 * Returns the shell command to run a script via the given PM.
 * Used for services in atreeconfig.json.
 */
export function pmRunCmd(pm: PackageManager, script: string): string {
  if (pm === "bun") return `bun run ${script}`;
  if (pm === "pnpm") return `pnpm ${script}`;
  if (pm === "yarn") return `yarn ${script}`;
  return `npm run ${script}`;
}

/**
 * Returns [cmd, ...args] tuple for adding packages.
 */
export function pmAddCmd(pm: PackageManager, packages: string[], dev: boolean): [string, ...string[]] {
  switch (pm) {
    case "bun":
      return dev ? ["bun", "add", "-d", ...packages] : ["bun", "add", ...packages];
    case "pnpm":
      return dev ? ["pnpm", "add", "-D", ...packages] : ["pnpm", "add", ...packages];
    case "yarn":
      return dev ? ["yarn", "add", "--dev", ...packages] : ["yarn", "add", ...packages];
    case "npm":
      return dev ? ["npm", "install", "--save-dev", ...packages] : ["npm", "install", ...packages];
    case "poetry":
      return dev ? ["poetry", "add", "--group", "dev", ...packages] : ["poetry", "add", ...packages];
    case "uv":
      return dev ? ["uv", "add", "--dev", ...packages] : ["uv", "add", ...packages];
    case "pip":
      return ["pip", "install", ...packages];
    case "cargo":
      return dev ? ["cargo", "add", "--dev", ...packages] : ["cargo", "add", ...packages];
    case "go":
      return ["go", "get", ...packages];
  }
}

/**
 * Returns [cmd, ...args] tuple for removing packages.
 */
export function pmRemoveCmd(pm: PackageManager, packages: string[]): [string, ...string[]] {
  switch (pm) {
    case "bun":    return ["bun", "remove", ...packages];
    case "pnpm":   return ["pnpm", "remove", ...packages];
    case "yarn":   return ["yarn", "remove", ...packages];
    case "npm":    return ["npm", "uninstall", ...packages];
    case "poetry": return ["poetry", "remove", ...packages];
    case "uv":     return ["uv", "remove", ...packages];
    case "pip":    return ["pip", "uninstall", "-y", ...packages];
    case "cargo":  return ["cargo", "remove", ...packages];
    case "go":     return ["go", "get", ...packages.map(p => `${p}@none`)];
  }
}

/**
 * Returns the lock file name(s) for a given package manager.
 */
export function lockFileNames(pm: PackageManager): string[] {
  return PM_REGISTRY[pm].lockFiles;
}

/**
 * Returns the manifest file name for the ecosystem.
 * This is the file that lists dependencies (package.json, pyproject.toml, etc.)
 */
export function manifestFileName(pm: PackageManager): string {
  switch (PM_REGISTRY[pm].ecosystem) {
    case "node":   return "package.json";
    case "python": return "pyproject.toml";
    case "rust":   return "Cargo.toml";
    case "go":     return "go.mod";
  }
}
