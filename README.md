# Agent Trees

> Git worktrees for humans and agents.

`atree` eliminates the friction of running multiple branches in parallel — shared `node_modules`, auto-linked `.env` files, zero manual setup. Designed for the way AI coding agents actually work: 2-3 worktrees active simultaneously, headless, in parallel.

## The problem

```bash
# what git worktrees give you
git worktree add ../my-feature feature-branch
cd ../my-feature
ln -s ../main/node_modules .      # manual
cp ../main/.env.local .           # manual

# what atree gives you
atree spawn feature-branch
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
2. **Detects AI agents** you already have installed — `claude`, `codex`, `gemini`, or any custom CLI (opencode, etc.)
3. **Scans your repo** — reads `package.json`, `Procfile`, `docker-compose.yml`, lock files, and other signals to understand your stack
4. **Asks the agent** to generate a tailored `atreeconfig.json` for your project (services, shared dirs, env files)
5. **Shows you the result** and asks for confirmation before writing anything

If no AI agent is found, it falls back to heuristic detection based on lock files and config files.

The agent runs entirely locally — no data leaves your machine.

```
$ atree init

Welcome to Agent Trees

atree init will:
  1. Scan your repo — read key config files (package.json, Procfile, etc.)
  2. Use an AI agent you already have installed to generate atreeconfig.json
  3. Show you the result and ask for confirmation before writing anything
  4. Update .gitignore to exclude atree runtime files

No data is sent anywhere — the agent runs locally on your machine.

Proceed? (Y/n)

Detected: claude, codex
Which agent to use? [claude] or type another:
```

## Usage

```bash
atree init                   # initialise in current repo (interactive, AI-assisted)
atree spawn <branch>         # create worktree, link deps + env
atree spawn -b <branch>      # create worktree on a new branch
atree status                 # show all trees and changed files
atree dev                    # start dev server for current tree
atree dev --all              # start all trees in parallel with prefixed logs
atree sync                   # re-link deps/env if symlinks break
atree kill <branch>          # remove worktree
```

## Config

Commit `atreeconfig.json` to share setup with your team:

```json
{
  "primary": "main",
  "share": ["node_modules"],
  "env": {
    "files": [".env", ".env.local", ".env.development.local"]
  },
  "services": {
    "web": {
      "command": "bun run dev",
      "scope": "tree"
    },
    "api": {
      "command": "bun run api",
      "scope": "primary"
    },
    "db": {
      "command": "docker compose up db",
      "scope": "shared"
    }
  },
  "hooks": {
    "postSpawn": "bun install"
  }
}
```

### Service scopes

| scope | behaviour |
|-------|-----------|
| `tree` | separate instance per worktree |
| `primary` | runs once on primary, all other trees point to it |
| `shared` | runs once, shared across all trees (DB, Redis, etc.) |

### Symlinks are visible

Shared dirs and env files are symlinks — they show up in `ls`. `ls -la` makes the target explicit:

```
lrwxr-xr-x  node_modules -> /path/to/primary/node_modules
lrwxr-xr-x  .env -> /path/to/primary/.env
```

Bundlers, runtimes, and editors follow symlinks transparently. If something breaks, `git worktree list` and `ls -la` tell you everything.

## What gets checked in

```
atreeconfig.json    ✅  shared team config
.atree/             ❌  machine-local (added to .gitignore by atree init)
```

## How it works

atree is a thin layer on top of `git worktree`. On `atree spawn` it:

1. Calls `git worktree add` to check out the branch
2. Symlinks `node_modules` (and other configured dirs) from the primary tree
3. Symlinks `.env*` files from the primary tree
4. Runs the `postSpawn` hook if configured

On `atree dev --all` it starts each service across all trees with color-coded prefixed output.

## Requirements

- git >= 2.25
- bun (for building from source), or just the compiled binary

## Development

```bash
bun install
bun run dev -- init        # run any command locally
bun run build              # compile to ./atree binary
```

## License

MIT
