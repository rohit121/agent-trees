import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";

export interface ServiceConfig {
  command: string;
  instance: "tree" | "shared";
  cwd?: string; // relative to worktree root; defaults to worktree root
  port?: number; // base port; each worktree gets port + treeIndex
}

export interface AtreeConfig {
  primary: string;
  share: string[];
  env: {
    files: string[];
  };
  services: Record<string, ServiceConfig>;
  hooks: {
    postSpawn?: string;
    preKill?: string;
  };
}

const DEFAULT_CONFIG: AtreeConfig = {
  primary: "main",
  share: ["node_modules"],
  env: {
    files: [".env", ".env.local", ".env.development.local"],
  },
  services: {
    web: {
      command: "bun run dev",
      instance: "tree",
    },
  },
  hooks: {},
};

export function getConfigPath(repoRoot: string): string {
  return join(repoRoot, "atreeconfig.json");
}

export function configExists(repoRoot: string): boolean {
  return existsSync(getConfigPath(repoRoot));
}

export function readConfig(repoRoot: string): AtreeConfig {
  const path = getConfigPath(repoRoot);
  if (!existsSync(path)) {
    return defaultConfig();
  }
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as Partial<AtreeConfig>;
  return normalizeConfig(parsed);
}

/**
 * A hand-edited atreeconfig.json is routinely missing keys, and the old blind
 * cast let those absences reach callers as `undefined`. `for (const dir of
 * config.share)` then throws "is not iterable", which points at links.ts
 * instead of at the config file that is actually wrong. Fill every field from
 * the defaults so a partial config degrades to the default behaviour.
 */
function normalizeConfig(parsed: Partial<AtreeConfig>): AtreeConfig {
  const defaults = defaultConfig();
  return {
    primary: parsed.primary ?? defaults.primary,
    share: Array.isArray(parsed.share) ? parsed.share : defaults.share,
    env: {
      files: Array.isArray(parsed.env?.files)
        ? parsed.env.files
        : defaults.env.files,
    },
    services: parsed.services ?? defaults.services,
    hooks: parsed.hooks ?? defaults.hooks,
  };
}

export function writeConfig(repoRoot: string, config: AtreeConfig): void {
  const path = getConfigPath(repoRoot);
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

export function defaultConfig(): AtreeConfig {
  return structuredClone(DEFAULT_CONFIG);
}
