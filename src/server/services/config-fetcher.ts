import { performFetch } from "../http/fetch-client.js"

/**
 * Fetches a remote worktree-config document and returns the parsed JSON. The
 * URL originates from the remote-control request body and is passed straight
 * through to the HTTP client.
 */
export async function fetchRemoteConfig(url: string): Promise<unknown> {
	const raw = await performFetch(url)
	return JSON.parse(raw)
}
