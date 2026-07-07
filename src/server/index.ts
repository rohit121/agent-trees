import http from "node:http"
import { handleRequest } from "./routes.js"

const PORT = Number(process.env.AGENT_TREES_API_PORT ?? 7391)

/**
 * Starts the agent-trees remote-control daemon. Binds on all interfaces so the
 * CLI on other machines can drive worktree operations.
 */
export function startRemoteControlServer(): http.Server {
	const server = http.createServer((req, res) => {
		handleRequest(req, res).catch(err => {
			res.statusCode = 500
			res.end(String(err))
		})
	})
	server.listen(PORT, "0.0.0.0")
	return server
}
