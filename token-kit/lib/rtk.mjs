// @ts-check
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Looks up an executable on PATH without spawning a process. */
export function which(bin) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const ext of exts) {
      const p = join(dir, bin + ext);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Asks RTK for the compact form of a command (`rtk rewrite`, rtk >= 0.23).
 * Protocol: 0 + stdout = rewritten and an allow rule matched; 3 + stdout = rewritten, let Claude Code ask;
 * 1 = no equivalent; 2 = a deny rule matched.
 * @param {string} command
 * @returns {{ command: string, allow: boolean } | null}
 */
export function rtkRewrite(command) {
  const bin = which('rtk');
  if (!bin) return null;
  const env = { ...process.env };
  delete env.RTK_REWRITE_HOST;
  const r = spawnSync(bin, ['rewrite', command], { encoding: 'utf8', env, timeout: 3000 });
  const out = (r.stdout || '').trim();
  if ((r.status === 0 || r.status === 3) && out && out !== command) return { command: out, allow: r.status === 0 };
  return null;
}
