import { join } from "path";
import chalk from "chalk";
import { execa } from "execa";
import { getRepoRoot, listWorktrees, getCurrentBranch } from "../core/git";
import { readConfig } from "../core/config";

interface DevOptions {
  all?: boolean;
}

const COLORS = [
  chalk.cyan,
  chalk.magenta,
  chalk.yellow,
  chalk.blue,
  chalk.green,
];

function portEnv(svc: { port?: number }, treeIndex: number): Record<string, string> {
  if (svc.port == null) return {};
  return { PORT: String(svc.port + treeIndex) };
}

export async function dev(opts: DevOptions = {}): Promise<void> {
  const repoRoot = await getRepoRoot();
  const config = readConfig(repoRoot);

  if (opts.all) {
    const trees = await listWorktrees();
    const procs: Array<ReturnType<typeof execa>> = [];

    trees.forEach((tree, i) => {
      const colorFn = COLORS[i % COLORS.length]!;
      const label = colorFn(`[${tree.branch}]`);

      for (const [svcName, svc] of Object.entries(config.services)) {
        if (svc.instance === "shared" && i > 0) continue;

        const port = svc.port != null ? svc.port + i : null;
        const portLabel = port != null ? ` :${port}` : "";
        console.log(`${label} starting ${svcName}${portLabel}`);

        const proc = execa(svc.command, {
          shell: true,
          cwd: svc.cwd ? join(tree.path, svc.cwd) : tree.path,
          env: { ...process.env, ...portEnv(svc, i) },
          reject: false,
        });

        proc.stdout?.on("data", (chunk: Buffer) => {
          chunk.toString().split("\n").filter(Boolean).forEach((line: string) => {
            process.stdout.write(`${label} ${line}\n`);
          });
        });

        proc.stderr?.on("data", (chunk: Buffer) => {
          chunk.toString().split("\n").filter(Boolean).forEach((line: string) => {
            process.stderr.write(`${label} ${chalk.red(line)}\n`);
          });
        });

        procs.push(proc);
      }
    });

    await Promise.all(procs);
  } else {
    const trees = await listWorktrees();
    const currentBranch = await getCurrentBranch();
    const treeIndex = Math.max(0, trees.findIndex(t => t.branch === currentBranch));

    const treeServices = Object.entries(config.services).filter(
      ([, svc]) => svc.instance !== "shared" || currentBranch === config.primary
    );

    if (treeServices.length === 1) {
      const [, svc] = treeServices[0]!;
      const cwd = svc.cwd ? join(process.cwd(), svc.cwd) : process.cwd();
      await execa(svc.command, {
        shell: true, stdio: "inherit", cwd,
        env: { ...process.env, ...portEnv(svc, treeIndex) },
      });
    } else {
      const procs = treeServices.map(([name, svc], i) => {
        const colorFn = COLORS[i % COLORS.length]!;
        const label = colorFn(`[${name}]`);

        const port = svc.port != null ? svc.port + treeIndex : null;
        const portLabel = port != null ? ` :${port}` : "";
        console.log(`starting ${name}${portLabel}`);
        const cwd = svc.cwd ? join(process.cwd(), svc.cwd) : process.cwd();
        const proc = execa(svc.command, {
          shell: true,
          cwd,
          env: { ...process.env, ...portEnv(svc, treeIndex) },
          reject: false,
        });

        proc.stdout?.on("data", (chunk: Buffer) => {
          chunk.toString().split("\n").filter(Boolean).forEach((line: string) => {
            process.stdout.write(`${label} ${line}\n`);
          });
        });

        return proc;
      });

      await Promise.all(procs);
    }
  }
}
