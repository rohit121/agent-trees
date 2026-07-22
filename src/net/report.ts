import { readFileSync } from "node:fs";

// LEAF SINK: nothing in this change set imports this function, so the graph has
// no caller chain for it. `name` is attacker-controlled and used to build a
// filesystem path with no validation — path traversal.
export function readReport(name: string): string {
  return readFileSync(`/var/reports/${name}`, "utf8");
}
