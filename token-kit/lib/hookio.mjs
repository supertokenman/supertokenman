// @ts-check
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Reads the JSON Claude Code sends on the hook's stdin. */
export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Prints the hook response. With nothing to say, exits silently (exit 0, empty stdout).
 * @param {object | null} out
 */
export function emit(out) {
  if (out) process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

/**
 * A hook must never break the session: any error becomes "no opinion".
 * @param {() => object | null} fn
 */
export function run(fn) {
  try {
    if (process.env.TOKEN_KIT_DISABLE === '1') emit(null);
    emit(fn());
  } catch (e) {
    if (process.env.TOKEN_KIT_DEBUG) process.stderr.write(String(e && /** @type {any} */ (e).stack || e));
    emit(null);
  }
}

/** true when the file was executed directly (node file.mjs), not imported. */
export function isMain(metaUrl) {
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1] || '');
  } catch {
    return false;
  }
}
