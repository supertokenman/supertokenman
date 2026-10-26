// The better terminal, the parts with no screen: hints (paths with a line number and commit ids, next to
// the links the web-links addon finds), the moves of the copy mode (vi keys over the scrollback), and a
// short command-line tip for what was just typed. Ideas from Alacritty (Apache-2.0); tips written in our
// own words, linking to jlevy/the-art-of-command-line (CC BY-SA 4.0) instead of copying it.

export type Hint = { kind: 'path' | 'commit'; text: string; start: number; end: number; line?: number; col?: number }

const PATH = /(?:^|[\s('"`])((?:\.{0,2}\/)?(?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]{1,8})(?::(\d+))?(?::(\d+))?(?=$|[\s)'"`,;])/g
const COMMIT = /(?:^|[\s(])([0-9a-f]{7,40})(?=$|[\s),.:])/g

/** Paths like src/app.ts:12:4 and commit ids in one line of the screen; URLs are left to the web-links addon. */
export function hintsOf(line: string): Hint[] {
  const out: Hint[] = []
  // URLs are blanked first (same length, so offsets hold); versions like v1.2.3 are not paths
  line = line.replace(/\b[a-z][\w+.-]*:\/\/\S+/gi, (u) => ' '.repeat(u.length))
  for (const m of line.matchAll(PATH)) {
    const text = m[1]!
    if (/^v?\d+(\.\d+)+$/.test(text)) continue
    const start = m.index! + m[0].indexOf(text)
    out.push({ kind: 'path', text, start, end: start + text.length + (m[2] ? m[2].length + 1 : 0) + (m[3] ? m[3].length + 1 : 0), ...(m[2] ? { line: Number(m[2]) } : {}), ...(m[3] ? { col: Number(m[3]) } : {}) })
  }
  for (const m of line.matchAll(COMMIT)) {
    const text = m[1]!
    if (!/[a-f]/.test(text) || !/\d/.test(text)) continue
    const start = m.index! + m[0].indexOf(text)
    if (out.some((h) => start >= h.start && start < h.end)) continue
    out.push({ kind: 'commit', text, start, end: start + text.length })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** A position in the scrollback: row is the buffer line, col the cell. */
export type Pos = { row: number; col: number }
export type Move = 'h' | 'j' | 'k' | 'l' | 'w' | 'b' | '0' | '$' | 'g' | 'G' | 'ctrl-u' | 'ctrl-d'

const isWord = (c: string | undefined) => !!c && /[\w.\-/@]/.test(c)

/** One vi move over the lines of the scrollback. */
export function move(p: Pos, m: Move, lines: string[], page = 20): Pos {
  const last = Math.max(0, lines.length - 1)
  const at = (r: number) => lines[r] ?? ''
  const clampCol = (r: number, c: number) => Math.max(0, Math.min(c, Math.max(0, at(r).length - 1)))
  switch (m) {
    case 'h': return { row: p.row, col: Math.max(0, p.col - 1) }
    case 'l': return { row: p.row, col: clampCol(p.row, p.col + 1) }
    case 'j': return { row: Math.min(last, p.row + 1), col: clampCol(Math.min(last, p.row + 1), p.col) }
    case 'k': return { row: Math.max(0, p.row - 1), col: clampCol(Math.max(0, p.row - 1), p.col) }
    case '0': return { row: p.row, col: 0 }
    case '$': return { row: p.row, col: Math.max(0, at(p.row).trimEnd().length - 1) }
    case 'g': return { row: 0, col: 0 }
    case 'G': return { row: last, col: 0 }
    case 'ctrl-u': return { row: Math.max(0, p.row - page), col: 0 }
    case 'ctrl-d': return { row: Math.min(last, p.row + page), col: 0 }
    case 'w': {
      let { row, col } = p
      const s = at(row)
      // past this word, then past the gap, wrapping to the next line
      while (col < s.length && isWord(s[col])) col++
      while (col < s.length && !isWord(s[col])) col++
      if (col < s.length) return { row, col }
      for (row = row + 1; row <= last; row++) {
        const c = at(row).search(/[\w.\-/@]/)
        if (c >= 0) return { row, col: c }
      }
      return { row: last, col: clampCol(last, at(last).length) }
    }
    case 'b': {
      let { row, col } = p
      let s = at(row)
      col--
      while (true) {
        while (col >= 0 && !isWord(s[col])) col--
        if (col >= 0) break
        if (row === 0) return { row: 0, col: 0 }
        row--
        s = at(row)
        col = s.length - 1
      }
      while (col > 0 && isWord(s[col - 1])) col--
      return { row, col }
    }
  }
}

/** The text between two positions, in reading order, lines joined with newlines. */
export function between(a: Pos, b: Pos, lines: string[]): string {
  const [s, e] = a.row < b.row || (a.row === b.row && a.col <= b.col) ? [a, b] : [b, a]
  if (s.row === e.row) return (lines[s.row] ?? '').slice(s.col, e.col + 1)
  return [(lines[s.row] ?? '').slice(s.col).trimEnd(), ...lines.slice(s.row + 1, e.row).map((l) => l.trimEnd()), (lines[e.row] ?? '').slice(0, e.col + 1)].join('\n')
}

const GUIDE = 'https://github.com/jlevy/the-art-of-command-line'
const TIPS: { re: RegExp; tip: string }[] = [
  { re: /\bcat\s+\S+\s*\|\s*(grep|wc|head|tail|less)\b/, tip: 'grep, wc, head, tail and less read files themselves: no cat in front needed.' },
  { re: /\bps\s+(aux|-ef)\s*\|\s*grep\b/, tip: 'pgrep -fl name finds processes by name, and pkill sends them a signal.' },
  { re: /\bhistory\s*\|\s*grep\b/, tip: 'Ctrl+R searches your history as you type; press it again for older matches.' },
  { re: /\bfind\b.*\|\s*xargs\b(?!.*-0)/, tip: 'With find, use -print0 and xargs -0 so names with spaces do not break apart.' },
  { re: /\bgrep\s+-r\b/, tip: 'rg (ripgrep) searches folders much faster and skips what .gitignore ignores.' },
  { re: /\bchmod\s+(-R\s+)?777\b/, tip: '777 lets anyone change the file. 755 for programs and 644 for files is usually enough.' },
  { re: /\brm\s+-rf?\s+\S*\*/, tip: 'Before rm with a wildcard, run ls with the same pattern to see what it matches.' },
  { re: /\bcurl\s+(?!.*-f)\S+.*\|\s*(sh|bash)\b/, tip: 'Piping a download into a shell runs whatever the server sends. Save it, read it, then run it.' },
  { re: /\bdu\s+-sh\s+\*/, tip: 'du -sh * | sort -h lists sizes from smallest to largest.' },
  { re: /\bkill\s+-9\b/, tip: 'Try plain kill first: -9 gives the program no chance to clean up.' },
  { re: /\bcd\s+\.\.\s*&&\s*cd\s+\.\./, tip: 'cd - jumps back to the folder you were in before.' },
  { re: /\bsudo\s+!!/, tip: 'sudo !! repeats the last command with sudo; check what it was before you run it.' },
  { re: /\bgit\s+add\s+\.\s*&&\s*git\s+commit\b/, tip: 'git add -p lets you pick the changes to commit, piece by piece.' },
]
/** A tip for a command just run, or null; at most one, and not the same one twice in a row. */
export function tipFor(cmd: string, lastTip?: string): { tip: string; link: string } | null {
  const t = TIPS.find((x) => x.re.test(cmd))
  return t && t.tip !== lastTip ? { tip: t.tip, link: GUIDE } : null
}
