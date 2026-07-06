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
