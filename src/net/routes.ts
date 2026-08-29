import type { IncomingMessage, ServerResponse } from "node:http";
import { runDiagnostics } from "./service";

// ENTRY: HTTP handler for GET /diagnostics?host=<host>. `host` is fully
// attacker-controlled and flows entry -> service -> probe into a shell command.
export function handleDiagnosticsRequest(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const url = new URL(req.url ?? "", "http://localhost");
  const host = url.searchParams.get("host") ?? "";
  res.end(runDiagnostics(host));
}
