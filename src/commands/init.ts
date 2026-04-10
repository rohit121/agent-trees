import { join } from "path";
import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import * as readline from "readline";
import chalk from "chalk";
import { getRepoRoot, checkGitVersion, getCurrentBranch } from "../core/git";
import { configExists, writeConfig, defaultConfig, type AtreeConfig } from "../core/config";
import { detectPackageManager, pmRunCmd } from "../core/package-manager";
import { selectItems } from "../ui/multi-select.js";

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

// Detect workspace package directories from root package.json workspaces field
// and common monorepo directory conventions.
function detectWorkspacePackageDirs(repoRoot: string): string[] {
  const result: string[] = [];
  let workspaceGlobs: string[] = [];

  const rootPkgPath = join(repoRoot, "package.json");
  if (existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
      const ws = pkg.workspaces;
      if (Array.isArray(ws)) workspaceGlobs = ws;
      else if (ws?.packages && Array.isArray(ws.packages)) workspaceGlobs = ws.packages;
    } catch (err) {
      console.warn(chalk.yellow(`  warn: could not parse ${rootPkgPath}: ${err}`));
    }
  }

  // Also check common monorepo dirs not already covered by globs
  const commonDirs = ["packages", "apps", "services", "libs"];
  for (const dir of commonDirs) {
    if (!workspaceGlobs.some(g => g.startsWith(dir))) {
      if (existsSync(join(repoRoot, dir))) {
        workspaceGlobs.push(`${dir}/*`);
      }
    }
  }

  // Expand simple glob patterns (handle `dir/*` and `dir/**` style)
  for (const glob of workspaceGlobs) {
    if (!glob.includes("*")) {
      // Exact path
      const fullPath = join(repoRoot, glob);
      if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
        result.push(glob);
      }
      continue;
    }

    const baseDir = glob.replace(/\/\*\*?$/, "");
    const baseFullPath = join(repoRoot, baseDir);
    if (!existsSync(baseFullPath)) continue;

    try {
      const entries = readdirSync(baseFullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          result.push(join(baseDir, entry.name));
        }
      }
    } catch (err) {
      console.warn(chalk.yellow(`  warn: could not read ${baseFullPath}: ${err}`));
    }
  }

  return [...new Set(result)];
}

function buildFingerprint(repoRoot: string, selectedDirs: string[]): string {
  const lines: string[] = [];

  // Top-level file list
  const topFiles = readdirSync(repoRoot).filter(f => !f.startsWith(".") && f !== "node_modules");
  lines.push(`Files at repo root: ${topFiles.join(", ")}`);

  // Key config files
  const interesting = [
    "package.json", "pyproject.toml", "go.mod", "Cargo.toml",
    "Gemfile", "composer.json", "Procfile", "docker-compose.yml",
    "docker-compose.yaml",
    // Monorepo config files
    "pnpm-workspace.yaml", "turbo.json", "nx.json", "lerna.json",
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

  // Selected workspace packages only
  if (selectedDirs.length > 0) {
    lines.push(`\nSelected workspace packages: ${selectedDirs.join(", ")}`);
    const cap = 5;
    for (const pkgDir of selectedDirs.slice(0, cap)) {
      const pkgJsonPath = join(repoRoot, pkgDir, "package.json");
      if (existsSync(pkgJsonPath)) {
        const content = readFileSync(pkgJsonPath, "utf-8").slice(0, 1000);
        lines.push(`\n--- ${pkgDir}/package.json ---\n${content}`);
      }
    }
    if (selectedDirs.length > cap) {
      lines.push(`\n(${selectedDirs.length - cap} more packages not shown)`);
    }
  }

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
    "<service-name>": { "command": "<start command>", "instance": "tree or shared", "cwd": "<optional relative path from repo root>", "port": "<optional base port number>" }
  },
  "hooks": {}
}
- Detect all runnable services (web, api, worker, etc.) from scripts or Procfile
- For monorepos: create one service per workspace package that has a dev script; set "cwd" to the package directory (e.g. "apps/web")
- For share: include root-level shared dirs (node_modules, .venv) AND per-package ones (e.g. "apps/web/node_modules", "apps/api/.venv") — add a per-package entry for every package that is a Node.js or Python project
- For env.files: include root-level env files AND any per-package env files as relative paths (e.g. "apps/web/.env")
- Omit "cwd" for single-package repos or root-level services
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

  let rl = readline.createInterface({ input: process.stdin, output: process.stdout });

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
      chosenAgent = confirm.trim().toLowerCase() === "n" ? "" : found[0]!;
    } else {
      console.log(chalk.green(`\nDetected agents: ${found.join(", ")}`));
      const pick = await ask(rl, `Which agent to use? [${found[0]}] or type another: `);
      chosenAgent = pick.trim() || found[0]!;
    }

    // --- Package selection (monorepos) ---
    const allPackageDirs = detectWorkspacePackageDirs(repoRoot);
    let selectedDirs: string[] = [];

    if (allPackageDirs.length > 0) {
      // Build selector items — show what dev command each package would get
      const pm = detectPackageManager(repoRoot);
      const items = allPackageDirs.map(dir => {
        let hint: string | undefined;
        const pkgJsonPath = join(repoRoot, dir, "package.json");
        if (existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
            hint = pkg.scripts?.dev ? pmRunCmd(pm, "dev") : "(no dev script)";
          } catch {
            hint = "(could not read)";
          }
        }
        return { label: dir, value: dir, hint };
      });

      // Ink takes over stdin — close readline first, reopen after
      rl.close();
      console.log(); // spacing before Ink renders
      selectedDirs = await selectItems("Select packages to include in config", items);
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      if (selectedDirs.length === 0) {
        console.log(chalk.yellow("No packages selected — nothing to configure."));
        rl.close();
        return;
      }
      console.log(chalk.green(`✓ ${selectedDirs.length} package${selectedDirs.length === 1 ? "" : "s"} selected\n`));
    }

    // --- Build config ---
    const primaryBranch = (await getCurrentBranch()) || "main";
    let config: AtreeConfig;

    if (chosenAgent) {
      console.log(chalk.dim(`\nScanning repo and asking ${chosenAgent}...`));
      const fingerprint = buildFingerprint(repoRoot, selectedDirs);
      const prompt = buildPrompt(fingerprint, primaryBranch);

      try {
        const raw = await runAgent(chosenAgent, prompt);
        config = extractJSON(raw);
        console.log(chalk.green("✓ Config generated\n"));
      } catch (err) {
        console.log(chalk.yellow("Agent failed or returned invalid JSON — falling back to heuristics."));
        config = buildHeuristicConfig(repoRoot, primaryBranch, selectedDirs);
      }
    } else {
      config = buildHeuristicConfig(repoRoot, primaryBranch, selectedDirs);
    }

    // --- Optional: port assignment ---
    const treeServices = Object.entries(config.services).filter(([, s]) => s.instance === "tree");
    if (treeServices.length > 0) {
      const wantPorts = await ask(rl, chalk.bold("Assign ports to services? (avoids conflicts when running multiple branches) (y/N) "));
      if (wantPorts.trim().toLowerCase() === "y") {
        for (const [name, svc] of treeServices) {
          const portStr = await ask(rl, `  Base port for ${chalk.cyan(name)}${svc.cwd ? ` (${svc.cwd})` : ""}: `);
          const port = parseInt(portStr.trim(), 10);
          if (!isNaN(port) && port > 0) {
            svc.port = port;
          }
        }
        console.log(chalk.dim("  Each spawned worktree will get port+1, port+2, etc.\n"));
      }
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


function buildHeuristicConfig(repoRoot: string, primaryBranch: string, selectedDirs: string[]): AtreeConfig {
  const config = defaultConfig();
  config.primary = primaryBranch;

  const pm = detectPackageManager(repoRoot);
  const ENV_FILE_NAMES = [".env", ".env.local", ".env.development.local"];

  if (selectedDirs.length > 0) {
    // Monorepo: collect per-package shareable directories
    const shareSet = new Set(config.share); // keep root-level defaults
    for (const pkgDir of selectedDirs) {
      const fullPkgDir = join(repoRoot, pkgDir);
      if (existsSync(join(fullPkgDir, "package.json"))) {
        shareSet.add(join(pkgDir, "node_modules"));
      }
      if (
        existsSync(join(fullPkgDir, "pyproject.toml")) ||
        existsSync(join(fullPkgDir, "requirements.txt")) ||
        existsSync(join(fullPkgDir, "Pipfile"))
      ) {
        shareSet.add(join(pkgDir, ".venv"));
      }
    }
    config.share = [...shareSet];

    // Monorepo: one service per selected package that has a dev script
    config.services = {};

    for (const pkgDir of selectedDirs) {
      const pkgJsonPath = join(repoRoot, pkgDir, "package.json");
      if (!existsSync(pkgJsonPath)) continue;

      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        if (!pkg.scripts?.dev) continue;

        const name = (pkg.name as string | undefined)?.split("/").at(-1)
          ?? pkgDir.split("/").at(-1)
          ?? pkgDir;

        config.services[name] = {
          command: pmRunCmd(pm, "dev"),
          instance: "tree",
          cwd: pkgDir,
        };
      } catch (err) {
        console.warn(chalk.yellow(`  warn: could not read ${pkgJsonPath}: ${err}`));
      }
    }

    // Fall back to a generic web service if no selected packages had dev scripts
    if (Object.keys(config.services).length === 0) {
      config.services["web"] = { command: pmRunCmd(pm, "dev"), instance: "tree" };
    }

    // Collect env files: root-level defaults + any that actually exist in selected packages
    const envFiles: string[] = [...ENV_FILE_NAMES];
    for (const pkgDir of selectedDirs) {
      for (const f of ENV_FILE_NAMES) {
        if (existsSync(join(repoRoot, pkgDir, f))) {
          envFiles.push(join(pkgDir, f));
        }
      }
    }
    config.env.files = [...new Set(envFiles)];
  } else {
    // Single-package repo
    config.services["web"] = { command: pmRunCmd(pm, "dev"), instance: "tree" };
    config.env.files = ENV_FILE_NAMES;
  }

  return config;
}
