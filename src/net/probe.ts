import { execSync } from "node:child_process";

// SINK (reachable): runs a network reachability probe against the given host.
export function pingHost(host: string): string {
  // `host` originates from an untrusted HTTP query parameter and is interpolated
  // directly into a shell command — OS command injection.
  return execSync(`ping -c 1 ${host}`).toString();
}
