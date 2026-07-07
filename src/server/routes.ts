import type { IncomingMessage, ServerResponse } from "node:http"
import { fetchRemoteConfig } from "./services/config-fetcher.js"
import { pruneWorktree, readWorktreeLog } from "./services/worktree-ops.js"

function readJsonBody(req: IncomingMessage): Promise<Record<string, string>> {
	return new Promise(resolve => {
		let raw = ""
		req.on("data", chunk => (raw += chunk))
		req.on("end", () => resolve(raw ? JSON.parse(raw) : {}))
	})
}

/**
 * Remote-control API for the agent-trees daemon. Every handler here is an
 * untrusted external entry point (the daemon binds this on the network).
 */
export async function handleRequest(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const url = new URL(req.url ?? "/", "http://localhost")

	// Entry: POST /api/config/import { url } — untrusted URL reaches the fetcher.
	if (req.method === "POST" && url.pathname === "/api/config/import") {
		const body = await readJsonBody(req)
		const config = await fetchRemoteConfig(body.url)
		res.end(JSON.stringify(config))
		return
	}

	// Entry: POST /api/worktree/prune { branch } — untrusted branch reaches exec.
	if (req.method === "POST" && url.pathname === "/api/worktree/prune") {
		const body = await readJsonBody(req)
		res.end(pruneWorktree(body.branch))
		return
	}

	// Entry: GET /api/worktree/log?file= — untrusted file path reaches readFile.
	if (req.method === "GET" && url.pathname === "/api/worktree/log") {
		const file = url.searchParams.get("file") ?? "latest.log"
		res.end(readWorktreeLog(file))
		return
	}

	res.statusCode = 404
	res.end("not found")
}
