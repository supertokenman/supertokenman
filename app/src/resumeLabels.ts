/**
 * Short, distinct names for the folders of panels from last time. The same folder twice is counted
 * ("api (2)"); two folders with the same name get their parent ("dev/api, old/api"). A name never repeats.
 */
export function resumeLabels(cwds: string[]): string[] {
  const parts = (c: string) => c.split(/[\\/]/).filter(Boolean)
  const counts = new Map<string, number>()
  for (const c of cwds) counts.set(parts(c).join('/'), (counts.get(parts(c).join('/')) ?? 0) + 1)
  const keys = [...counts.keys()]
  const base = (k: string) => k.split('/').at(-1) ?? k
  return keys.map((k) => {
    const p = k.split('/')
    const name = keys.some((o) => o !== k && base(o) === base(k)) && p.length > 1 ? p.slice(-2).join('/') : base(k)
    const n = counts.get(k) ?? 1
    return n > 1 ? `${name} (${n})` : name
  })
}
