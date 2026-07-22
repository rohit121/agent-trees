import { pingHost } from "./probe";

// HOP: orchestrates diagnostics for a requested host.
export function runDiagnostics(host: string): string {
  return pingHost(host);
}
