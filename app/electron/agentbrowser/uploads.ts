// Which files the agent may offer to a page. A path must be a real file inside the project folder (the
// panel's working folder); anything else is refused before the person is even asked. Symlinks are resolved,
// so a link inside the project that points outside it does not pass.
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

export type UploadCheck = { ok: true; path: string; size: number } | { ok: false; error: string }

export function checkUpload(root: string, raw: string): UploadCheck {
  if (!raw || raw.includes('\0')) return { ok: false, error: 'No such file.' }
  let base: string
  let real: string
  try {
    base = realpathSync(root)
    real = realpathSync(isAbsolute(raw) ? raw : resolve(root, raw))
  } catch {
    return { ok: false, error: 'No such file in the project.' }
  }
  const rel = relative(base, real)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return { ok: false, error: 'Only files inside the project folder can be uploaded.' }
  try {
    const st = statSync(real)
    if (!st.isFile()) return { ok: false, error: 'That path is not a file.' }
    return { ok: true, path: real, size: st.size }
  } catch {
    return { ok: false, error: 'No such file in the project.' }
  }
}
