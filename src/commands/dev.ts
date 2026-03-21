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
        if (svc.scope === "shared" && i > 0) continue;
        if (svc.scope === "primary" && i > 0) continue;

        console.log(`${label} starting ${svcName}`);

        const proc = execa(svc.command, {
          shell: true,
          cwd: tree.path,
          env: { ...process.env },
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
    const currentBranch = await getCurrentBranch();
    const treeServices = Object.entries(config.services).filter(
      ([, svc]) => svc.scope !== "shared" || currentBranch === config.primary
    );

    if (treeServices.length === 1) {
      const [, svc] = treeServices[0]!;
      await execa(svc.command, { shell: true, stdio: "inherit" });
    } else {
      const procs = treeServices.map(([name, svc], i) => {
        const colorFn = COLORS[i % COLORS.length]!;
        const label = colorFn(`[${name}]`);

        console.log(`starting ${name}`);
        const proc = execa(svc.command, {
          shell: true,
          cwd: process.cwd(),
          env: { ...process.env },
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
