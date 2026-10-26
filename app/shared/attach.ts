// What a message can carry: images Claude sees (pasted, dropped or picked) and files or folders it is
// pointed at by path, to read when it needs them.
export type Attachment =
  | { kind: 'image'; name: string; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string }
  | { kind: 'file'; name: string; path: string; dir?: boolean }

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
/** The API's own cap on one image. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_ATTACHMENTS = 10

export const imageTypeOf = (name: string): (typeof IMAGE_TYPES)[number] | null => {
  const ext = name.toLowerCase().split('.').pop()
  return ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : null
}

/** Attachments as they arrived from the window, checked: known image types under the cap, absolute paths, ten at most. */
export function cleanAttachments(input: unknown): Attachment[] {
  if (!Array.isArray(input)) return []
  const out: Attachment[] = []
  for (const a of input.slice(0, MAX_ATTACHMENTS) as Record<string, unknown>[]) {
    const name = String(a?.name ?? '').slice(0, 200)
    if (a?.kind === 'image' && IMAGE_TYPES.includes(a.mediaType as never) && typeof a.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(a.data) && (a.data.length * 3) / 4 <= MAX_IMAGE_BYTES)
      out.push({ kind: 'image', name: name || 'image', mediaType: a.mediaType as (typeof IMAGE_TYPES)[number], data: a.data })
    else if (a?.kind === 'file' && typeof a.path === 'string' && a.path.startsWith('/') && !a.path.includes('\0'))
      out.push({ kind: 'file', name: name || a.path.split('/').pop() || a.path, path: a.path, dir: Boolean(a.dir) })
  }
  return out
}

/** The text Claude gets for the files: where they are, to read as needed. */
export function filesNote(files: { path: string; dir?: boolean }[]): string {
  if (!files.length) return ''
  return `\n\nAttached ${files.length === 1 ? 'file' : 'files'} (read what you need):\n${files.map((f) => `- ${f.path}${f.dir ? '/ (folder)' : ''}`).join('\n')}`
}
