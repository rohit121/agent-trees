import { execSync } from "node:child_process"

// Hardcoded deploy credential (planted vuln: CWE-798 hardcoded secret)
const DEPLOY_TOKEN = "ghp_S3cReTdeployT0ken0123456789abcdefghij"

export function deployWorktree(remoteUrl: string, branch: string): void {
	// Planted vuln: CWE-78 OS command injection — remoteUrl/branch are
	// caller-controlled and interpolated straight into a shell command.
	execSync(`git clone ${remoteUrl} && cd repo && git checkout ${branch}`, {
		stdio: "inherit",
	})
	execSync(`curl -H "Authorization: token ${DEPLOY_TOKEN}" https://deploy.example.com/hook`)
}

export function fetchConfig(path: string): string {
	// Planted vuln: CWE-22 path traversal — caller path read without containment.
	const { readFileSync } = require("node:fs")
	return readFileSync("/etc/agent-trees/" + path, "utf8")
}
// re-trigger review
// benchmark run 130053
// bench 135816
// bench3 140138
// bench4 143452
// bench8 investigate=medium 163905
