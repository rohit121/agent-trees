import { join } from "path";
import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync } from "fs";
import { execSync } from "child_process";
import * as readline from "readline";
import chalk from "chalk";
import { getRepoRoot, checkGitVersion, getCurrentBranch } from "../core/git";
import { configExists, writeConfig, defaultConfig, type AtreeConfig } from "../core/config";

const ATREE_GITIGNORE = `
# agent-trees
.atree/
`;

const KNOWN_AGENTS = [
  { name: "claude", cmd: "claude", flag: "--print" },
  { name: "codex",  cmd: "codex",  flag: "--quiet" },
  { name: "gemini", cmd: "gemini", flag: "--quiet" },
];

// Common install paths for agents that may not be on the default sh PATH
const AGENT_FALLBACK_PATHS: Record<string, string[]> = {
  claude: [
    `${process.env.HOME}/.claude/local/claude`,
    "/usr/local/bin/claude",
  ],
};

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function detectAgents(): string[] {
  return KNOWN_AGENTS
    .filter(a => {
      try {
        // command -v works for binaries on PATH in /bin/sh
        execSync(`command -v ${a.cmd}`, { stdio: "ignore", shell: "/bin/sh" });
        return true;
      } catch {
        // fall back to known install paths
        return (AGENT_FALLBACK_PATHS[a.name] ?? []).some(p => existsSync(p));
      }
    })
    .map(a => a.name);
}

function resolveAgentCmd(name: string): string {
  // If the agent isn't on PATH, use its known install path
  try {
    execSync(`command -v ${name}`, { stdio: "ignore", shell: "/bin/sh" });
    return name;
  } catch {
    const fallback = (AGENT_FALLBACK_PATHS[name] ?? []).find(p => existsSync(p));
    return fallback ?? name;
  }
}

function buildFingerprint(repoRoot: string): string {
  const lines: string[] = [];

  // Top-level file list
  const topFiles = readdirSync(repoRoot).filter(f => !f.startsWith(".") && f !== "node_modules");
  lines.push(`Files at repo root: ${topFiles.join(", ")}`);

  // Key config files
  const interesting = [
    "package.json", "pyproject.toml", "go.mod", "Cargo.toml",
    "Gemfile", "composer.json", "Procfile", "docker-compose.yml",
    "docker-compose.yaml",
  ];
  for (const f of interesting) {
    const p = join(repoRoot, f);
    if (existsSync(p)) {
      const content = readFileSync(p, "utf-8").slice(0, 2000);
      lines.push(`\n--- ${f} ---\n${content}`);
    }
  }

  // Lock files present
  const locks = ["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock",
                  "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock", "go.sum"];
  const foundLocks = locks.filter(l => existsSync(join(repoRoot, l)));
  if (foundLocks.length) lines.push(`\nLock files: ${foundLocks.join(", ")}`);

  return lines.join("\n");
}

function buildPrompt(fingerprint: string, primaryBranch: string): string {
  return `You are helping configure a developer tool called agent-trees.
Analyze this repository fingerprint and generate a valid atreeconfig.json.

Rules:
- Output ONLY raw JSON, no markdown fences, no explanation
- Use this exact schema:
{
  "primary": "<primary branch name>",
  "share": ["<dirs to symlink across worktrees, e.g. node_modules, .venv>"],
  "env": { "files": ["<env files that should be shared, e.g. .env, .env.local>"] },
  "services": {
    "<service-name>": { "command": "<start command>", "scope": "tree" }
  },
  "hooks": {}
}
- Detect all runnable services (web, api, worker, etc.) from scripts or Procfile
- primary branch is: ${primaryBranch}

Repository fingerprint:
${fingerprint}`;
}

async function runAgent(agentName: string, prompt: string): Promise<string> {
  const agent = KNOWN_AGENTS.find(a => a.name === agentName);
  const flag = agent?.flag ?? "--print";
  const cmd = resolveAgentCmd(agentName);
  const escaped = prompt.replace(/'/g, `'\\''`);
  const output = execSync(`'${cmd}' ${flag} '${escaped}'`, {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
  return output.trim();
}

function extractJSON(raw: string): AtreeConfig {
  // Strip markdown fences if agent added them anyway
  const cleaned = raw.replace(/^```[a-z]*\n?/m, "").replace(/```$/m, "").trim();
  return JSON.parse(cleaned) as AtreeConfig;
}

export async function init(): Promise<void> {
  await checkGitVersion();

  const repoRoot = await getRepoRoot();
  const atreeDir = join(repoRoot, ".atree");

  if (!existsSync(atreeDir)) {
    mkdirSync(atreeDir, { recursive: true });
  }

  if (configExists(repoRoot)) {
    console.log(chalk.yellow("Agent Trees already initialised (atreeconfig.json exists)"));
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // --- Intro ---
    console.log(`
${chalk.bold("Welcome to Agent Trees")}

${chalk.cyan("atree init")} will:
  1. ${chalk.white("Scan your repo")} — read key config files (package.json, Procfile, etc.)
  2. ${chalk.white("Use an AI agent")} you already have installed to generate ${chalk.cyan("atreeconfig.json")}
  3. ${chalk.white("Show you the result")} and ask for confirmation before writing anything
  4. ${chalk.white("Update .gitignore")} to exclude atree runtime files

No data is sent anywhere — the agent runs locally on your machine.
`);

    const proceed = await ask(rl, chalk.bold("Proceed? (Y/n) "));
    if (proceed.trim().toLowerCase() === "n") {
      console.log("Aborted.");
      rl.close();
      return;
    }

    // --- Agent selection ---
    const found = detectAgents();
    let chosenAgent: string;

    if (found.length === 0) {
      console.log(chalk.yellow("\nNo known AI agents detected (claude, codex, gemini)."));
      const custom = await ask(rl, "Enter the CLI command for your agent (or leave blank to skip AI): ");
      if (!custom.trim()) {
        console.log(chalk.dim("Skipping AI — generating a basic config from heuristics."));
        chosenAgent = "";
      } else {
        chosenAgent = custom.trim();
      }
    } else if (found.length === 1) {
      console.log(chalk.green(`\nDetected: ${found[0]}`));
      const confirm = await ask(rl, `Use ${chalk.cyan(found[0])} to generate config? (Y/n) `);
      chosenAgent = confirm.trim().toLowerCase() === "n" ? "" : found[0];
    } else {
      console.log(chalk.green(`\nDetected agents: ${found.join(", ")}`));
      const pick = await ask(rl, `Which agent to use? [${found[0]}] or type another: `);
      chosenAgent = pick.trim() || found[0];
    }

    // --- Build config ---
    const primaryBranch = (await getCurrentBranch()) || "main";
    let config: AtreeConfig;

    if (chosenAgent) {
      console.log(chalk.dim(`\nScanning repo and asking ${chosenAgent}...`));
      const fingerprint = buildFingerprint(repoRoot);
      const prompt = buildPrompt(fingerprint, primaryBranch);

      try {
        const raw = await runAgent(chosenAgent, prompt);
        config = extractJSON(raw);
        console.log(chalk.green("✓ Config generated\n"));
      } catch (err) {
        console.log(chalk.yellow("Agent failed or returned invalid JSON — falling back to heuristics."));
        config = buildHeuristicConfig(repoRoot, primaryBranch);
      }
    } else {
      config = buildHeuristicConfig(repoRoot, primaryBranch);
    }

    // --- Review & confirm ---
    console.log(chalk.bold("Generated atreeconfig.json:"));
    console.log(chalk.dim(JSON.stringify(config, null, 2)));
    console.log();

    const write = await ask(rl, chalk.bold("Write this config? (Y/n/edit) "));
    const answer = write.trim().toLowerCase();

    if (answer === "n") {
      console.log("Aborted. Nothing was written.");
      rl.close();
      return;
    }

    if (answer === "edit") {
      console.log(chalk.dim("Tip: run your editor on atreeconfig.json after init writes it, then adjust."));
    }

    writeConfig(repoRoot, config);
    console.log(chalk.green("✓ created atreeconfig.json"));

    // --- Update .gitignore ---
    const gitignorePath = join(repoRoot, ".gitignore");
    const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
    if (!existing.includes("# agent-trees")) {
      appendFileSync(gitignorePath, ATREE_GITIGNORE);
      console.log(chalk.green("✓ updated .gitignore"));
    }

    console.log(`
${chalk.bold("Agent Trees initialised")}

Next:
  ${chalk.cyan("atree spawn <branch>")}   create a new worktree
  ${chalk.cyan("atree status")}           show all trees
`);
  } finally {
    rl.close();
  }
}

function buildHeuristicConfig(repoRoot: string, primaryBranch: string): AtreeConfig {
  const config = defaultConfig();
  config.primary = primaryBranch;

  const webSvc = config.services["web"];
  if (webSvc) {
    if (existsSync(join(repoRoot, "bun.lockb")) || existsSync(join(repoRoot, "bun.lock"))) {
      webSvc.command = "bun run dev";
    } else if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) {
      webSvc.command = "pnpm dev";
    } else if (existsSync(join(repoRoot, "yarn.lock"))) {
      webSvc.command = "yarn dev";
    } else if (existsSync(join(repoRoot, "package-lock.json"))) {
      webSvc.command = "npm run dev";
    }
  }

  return config;
}
