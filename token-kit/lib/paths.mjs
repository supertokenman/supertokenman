// @ts-check
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory of the running kit (where bin/, hooks/ and lib/ live). */
export const KIT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Claude Code config directory. Honors CLAUDE_CONFIG_DIR. */
export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/** Kit data directory: config, logs, state and stats. TOKEN_KIT_HOME overrides it (used by tests). */
export function dataDir() {
  return process.env.TOKEN_KIT_HOME || join(claudeDir(), 'token-kit');
}

export const logsDir = () => join(dataDir(), 'logs');
export const stateDir = () => join(dataDir(), 'state');
export const configPath = () => join(dataDir(), 'config.json');

/** How hooks invoke the condenser. The same string becomes an allow rule at install time. */
export function condenseInvocation(kitDir = KIT_DIR) {
  const script = join(kitDir, 'bin', 'tk-condense.mjs');
  return /\s/.test(script) ? `node "${script}"` : `node ${script}`;
}

/**
 * Path to this Node for scripts written to disk. Homebrew's process.execPath names a versioned
 * Cellar folder that disappears on the next `brew upgrade node`, so prefer the PATH entry
 * (a symlink such as /opt/homebrew/bin/node) that resolves to the same binary.
 */
export function stableNode(execPath = process.execPath, path = process.env.PATH || '') {
  const real = (/** @type {string} */ p) => {
    try {
      return realpathSync(p);
    } catch {
      return '';
    }
  };
  const target = real(execPath);
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, process.platform === 'win32' ? 'node.exe' : 'node');
    if (candidate !== execPath && target && real(candidate) === target) return candidate;
  }
  return execPath;
}
