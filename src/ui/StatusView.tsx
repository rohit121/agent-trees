import React from "react";
import { Box, Text } from "ink";
import type { WorktreeEntry } from "../core/git";
import type { AtreeConfig } from "../core/config";

interface Props {
  trees: WorktreeEntry[];
  changedFiles: Record<string, number>;
  config: AtreeConfig;
}

export function StatusView({ trees, changedFiles, config }: Props) {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text bold>agent trees</Text>
      <Box marginTop={1} flexDirection="column">
        {trees.map((tree) => {
          const changed = changedFiles[tree.branch] ?? 0;
          const isPrimary = tree.branch === config.primary;

          return (
            <Box key={tree.branch} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={isPrimary ? "green" : "cyan"} bold>
                  {isPrimary ? "● " : "○ "}
                </Text>
                <Text bold>{tree.branch}</Text>
                {isPrimary && <Text dimColor> (primary)</Text>}
                {changed > 0 && (
                  <Text color="yellow"> {changed} changed</Text>
                )}
              </Box>
              <Box marginLeft={2} flexDirection="column">
                <Text dimColor>{tree.path}</Text>
                <Box>
                  {Object.entries(config.services).map(([svc, svcConfig]) => (
                    <Box key={svc} marginRight={3}>
                      <Text color="blue">{svc}</Text>
                      <Text dimColor> [{svcConfig.instance}]</Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
