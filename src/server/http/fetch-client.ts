import http from "node:http"
import https from "node:https"

/**
 * Low-level fetch used by the remote-control API to pull configuration
 * documents referenced by an incoming request.
 */
export function performFetch(targetUrl: string): Promise<string> {
	const client = targetUrl.startsWith("https:") ? https : http
	return new Promise((resolve, reject) => {
		// Sink: the request destination is fully attacker-controlled — no host
		// allowlist, no block on link-local / metadata ranges.
		const req = client.get(targetUrl, res => {
			let body = ""
			res.on("data", chunk => (body += chunk))
			res.on("end", () => resolve(body))
		})
		req.on("error", reject)
	})
}
