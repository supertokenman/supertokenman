// Phase 92: colours come from the theme tokens; a hex colour written straight into a screen is flagged.
// Files that hold colours on purpose (the themes, brand marks, the terminal palette) have a ceiling
// instead, so they can only shrink.

const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g

/** Hex colours in a source text, ignoring comments. */
export function hexes(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  return [...code.matchAll(HEX)].map((m) => m[0])
}

export type Verdict = { file: string; found: number; ceiling: number }
/** Files over their ceiling; a file not listed has a ceiling of zero. */
export function overCeiling(files: { file: string; text: string }[], ceilings: Record<string, number>): Verdict[] {
  return files.map((f) => ({ file: f.file, found: hexes(f.text).length, ceiling: ceilings[f.file] ?? 0 })).filter((v) => v.found > v.ceiling)
}
