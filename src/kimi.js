/**
 * kimi-webbridge status helper — shared by `claudenv capabilities` and
 * `claudenv doctor` so the daemon shell-out lives in exactly one place.
 *
 * kimi-webbridge drives the user's real browser via a local daemon. The binary
 * always lives at ~/.kimi-webbridge/bin/kimi-webbridge (per its operations.md).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

export function kimiBinPath() {
  return join(homedir(), '.kimi-webbridge', 'bin', 'kimi-webbridge');
}

/**
 * Resolve the daemon state. Never throws.
 * @returns {{installed: boolean, running: boolean, extensionConnected: boolean, version: string|null}}
 */
export function kimiStatus() {
  const bin = kimiBinPath();
  if (!existsSync(bin)) {
    return { installed: false, running: false, extensionConnected: false, version: null };
  }
  try {
    const out = execSync(`"${bin}" status`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    const json = JSON.parse(out);
    return {
      installed: true,
      running: !!json.running,
      extensionConnected: !!json.extension_connected,
      version: json.version || null,
    };
  } catch {
    return { installed: true, running: false, extensionConnected: false, version: null };
  }
}
