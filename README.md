# Agent Trees

> Git worktrees for humans and agents.

## The new way of building

AI coding agents have changed how we work. Instead of one developer, one branch, one terminal — you're now running **2 or 3 features in parallel**, each with its own agent. One agent is building the auth flow, another is refactoring the API, a third is fixing a bug. All at the same time.

Git supports this with worktrees — separate working directories, each on their own branch, sharing the same repo. But the moment you try to actually use them, you hit a wall:

- Your `.env` files live in the main branch. Each worktree needs them, but they're not there.
- `node_modules` is 400MB. You don't want to reinstall it for every branch.
- Your dev server hardcodes port 3000. Three agents, three dev servers — they all fight over the same port.
- Every new worktree is a fresh checkout with none of the setup your main branch has.

So instead of parallelism, you end up manually copying files, symlinking directories, and babysitting each agent's environment. The overhead kills the benefit.

**Agent Trees fixes this.** One command to spawn a worktree that's fully wired up — dependencies linked, env files shared, services ready to run.

## How it works

```bash
atree spawn feature-auth
```

That's it. Agent Trees:

1. Creates a git worktree for the branch
2. Symlinks `node_modules` (and any other configured dirs) from your main branch — no reinstall
3. Symlinks your `.env`, `.env.local` and other config files from your main branch
4. Runs any `postSpawn` hooks you've configured (migrations, code generation, etc.)

Your agent can immediately `cd` in and start working. No setup, no missing env vars, no port conflicts to resolve manually.

```
your-repo/                  ← main branch, primary worktree
your-repo-feature-auth/     ← spawned by atree, fully wired up
your-repo-fix-payments/     ← spawned by atree, fully wired up
```

## Install

```bash
npm install -g @agent-trees/atree
# or
npx @agent-trees/atree init
```

**From source:**
```bash
git clone https://github.com/rohit121/agent-trees
cd agent-trees
bun install && bun run build
cp dist/atree.js /usr/local/bin/atree
```

## Getting started

```bash
atree init
```

`atree init` walks you through setup interactively:

1. **Explains what it will do** and asks permission before touching anything
2. **Detects AI agents** you already have installed — `claude`, `codex`, `gemini`, or any custom CLI
3. **Scans your repo** — reads `package.json`, `Procfile`, `docker-compose.yml`, lock files, and other signals to understand your stack
4. **For monorepos:** detects workspace packages and lets you pick which ones to include
5. **Asks the agent** to generate a tailored `atreeconfig.json` for your project
6. **Shows you the result** and asks for confirmation before writing anything

If no AI agent is found, it falls back to heuristic detection.

## Usage

```bash
atree init                   # set up agent trees in current repo
atree spawn <branch>         # create a worktree, link deps + env
atree spawn -b <branch>      # create a worktree on a new branch
atree status                 # show all active trees and changed files
atree dev                    # start dev server for current tree
atree dev --all              # start all trees in parallel with prefixed logs
atree sync                   # re-link deps/env if symlinks break
atree kill <branch>          # remove a worktree
```

## Config

Commit `atreeconfig.json` to share setup with your team.

### Sharing dependencies and env files

The `share` array lists directories to symlink from the primary worktree into every spawned tree. The `env.files` array lists files to symlink the same way.

```json
{
  "primary": "main",
  "share": ["node_modules"],
  "env": {
    "files": [".env", ".env.local"]
  },
  "hooks": {
    "postSpawn": "npm install"
  }
}
```

Symlinks are visible — they show up in `ls -la`:

```
lrwxr-xr-x  node_modules -> /path/to/primary/node_modules
lrwxr-xr-x  .env -> /path/to/primary/.env
```

Bundlers, runtimes, and editors follow symlinks transparently. If something breaks, `git worktree list` and `ls -la` tell you everything.

### Services

The `services` map defines what `atree dev` starts. Each service has a `command`, an `instance` mode, and an optional `cwd`.

```json
{
  "services": {
    "web": {
      "command": "npm run dev",
      "instance": "tree"
    },
    "db": {
      "command": "docker compose up db",
      "instance": "shared"
    }
  }
}
```

| `instance` | behaviour |
|------------|-----------|
| `tree`     | one instance per worktree — each branch runs its own |
| `shared`   | runs once from the primary worktree, all trees share it |

Use `shared` for infrastructure that doesn't change per branch (databases, queues, mock servers). Use `tree` for the code you're actively developing.

### Monorepo support

For monorepos, `atree init` detects workspace packages and lets you select which ones to include. Each selected package gets its own service entry and its own symlinked `node_modules` (or `.venv` for Python).

```json
{
  "primary": "main",
  "share": ["node_modules", "apps/web/node_modules", "apps/api/node_modules"],
  "env": {
    "files": [".env", "apps/web/.env", "apps/api/.env"]
  },
  "services": {
    "db": {
      "command": "docker compose up db",
      "instance": "shared"
    },
    "api": {
      "command": "npm run dev",
      "instance": "shared",
      "cwd": "apps/api"
    },
    "web": {
      "command": "npm run dev",
      "instance": "tree",
      "cwd": "apps/web"
    }
  }
}
```

This is the key pattern for monorepos: mark the services you're not changing as `shared` so they run once from the primary tree, and only run `tree` instances for the packages you're actively developing. When you spawn a feature branch, `atree dev` starts only the `tree` services — the rest are already running.

### Hooks

```json
{
  "hooks": {
    "postSpawn": "npm install",
    "preKill": "npm run cleanup"
  }
}
```

`postSpawn` runs inside the new worktree immediately after it's created — good for installing deps, running migrations, or generating code.

## What gets checked in

```
atreeconfig.json    ✅  shared team config
.atree/             ❌  machine-local (added to .gitignore by atree init)
```

## Requirements

- git >= 2.25
- Node >= 22

## Development

```bash
bun install
bun run dev -- init        # run any command locally
bun run build              # bundle to dist/atree.js
```

## License

MIT
