import React, { useState } from "react";
import { render, Text, Box, useInput, useApp } from "ink";

export interface SelectItem {
  label: string;
  value: string;
  hint?: string; // shown dimmed on the right
}

function MultiSelectUI({
  title,
  items,
  onDone,
}: {
  title: string;
  items: SelectItem[];
  onDone: (selected: string[]) => void;
}) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [checked, setChecked] = useState<boolean[]>(items.map(() => true));

  useInput((input, key) => {
    if (items.length === 0) return;
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1));
    if (input === " ") {
      setChecked((prev) => {
        const next = [...prev];
        next[cursor] = !next[cursor]!;
        return next;
      });
    }
    if (key.return) {
      onDone(items.filter((_, i) => checked[i]).map((item) => item.value));
      exit();
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text bold>{title}</Text>
        <Text dimColor>  ↑↓ navigate · space toggle · enter confirm</Text>
      </Box>
      {items.map((item, i) => (
        <Box key={item.value}>
          <Text color={i === cursor ? "cyan" : undefined}>
            {`  ${checked[i] ? "◉" : "○"}  ${item.label}`}
          </Text>
          {item.hint && <Text dimColor>{`  ${item.hint}`}</Text>}
        </Box>
      ))}
    </Box>
  );
}

/** Renders an interactive multi-select. Returns the selected values. */
export function selectItems(title: string, items: SelectItem[]): Promise<string[]> {
  return new Promise((resolve) => {
    render(
      <MultiSelectUI title={title} items={items} onDone={resolve} />
    );
  });
}
