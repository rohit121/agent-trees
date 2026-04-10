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
  return JSON.parse(raw) as AtreeConfig;
}

export function writeConfig(repoRoot: string, config: AtreeConfig): void {
  const path = getConfigPath(repoRoot);
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

export function defaultConfig(): AtreeConfig {
  return structuredClone(DEFAULT_CONFIG);
}
