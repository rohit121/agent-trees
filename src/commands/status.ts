import React from "react";
import { render } from "ink";
import { getRepoRoot, listWorktrees, getChangedFiles } from "../core/git";
import { readConfig } from "../core/config";
import { StatusView } from "../ui/StatusView";

export async function status(): Promise<void> {
  const repoRoot = await getRepoRoot();
  const config = readConfig(repoRoot);
  const trees = await listWorktrees();

  const changedFiles: Record<string, number> = {};
  await Promise.all(
    trees.map(async (tree) => {
      changedFiles[tree.branch] = await getChangedFiles(tree.path);
    })
  );

  render(
    React.createElement(StatusView, { trees, changedFiles, config })
  );
}
