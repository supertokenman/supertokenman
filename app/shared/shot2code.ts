// Screenshot to code, the parts with no network: the prompts that turn an image into files (HTML with
// Tailwind, or React with the project's own components and tokens), the files read back out of an
// answer, the stop rule for the rounds of render, compare and fix, and the prototype that links screens.
// Ideas from abi/screenshot-to-code (MIT); no code is copied.

export type Target = 'html' | 'react'
export type CodeFile = { path: string; content: string }
export type Round = { n: number; files: CodeFile[]; percent: number | null; costUsd: number; note?: string }

export const TARGETS: Record<Target, { label: string; entry: string }> = {
  html: { label: 'HTML + Tailwind', entry: 'index.html' },
  react: { label: 'React + Tailwind', entry: 'Screen.tsx' },
}

const RULES = `Rules:
- Match the image exactly: layout, spacing, sizes, colors, fonts, text. Use the exact text you see.
- Use placeholder boxes with a neutral fill for photos and logos; never invent a brand or copy a logo.
- No external images or fonts. Tailwind classes only, no custom CSS unless a value cannot be expressed.
- Answer with each file in a fenced block whose info line is the language and the file path, such as \`\`\`html index.html.`

/** The first round: the image becomes files. */
export function generatePrompt(t: Target, w: number, h: number, context?: { tokens?: string; components?: string[]; note?: string }): string {
  const what =
    t === 'html'
      ? `one file, index.html: a full HTML page that loads Tailwind with <script src="https://cdn.tailwindcss.com/3.4.17"></script> in the head`
      : `Screen.tsx, a React component exported as default, styled with Tailwind classes${context?.components?.length ? `, reusing these components of the project where they fit: ${context.components.slice(0, 40).join(', ')}` : ''}; and preview.html that renders it with React 18 UMD and Babel standalone from cdnjs, for the comparison`
  return `Rebuild this screenshot as code. The image is ${w}×${h} pixels; the page must render at that width.
Write ${what}.
${context?.tokens ? `Use these design tokens of the project where they match:\n${context.tokens.slice(0, 4000)}\n` : ''}${context?.note ? `Note from the person: ${context.note.slice(0, 1000)}\n` : ''}${RULES}`
}

/** A later round: what the comparison found, and the current files to fix. */
export function fixPrompt(t: Target, files: CodeFile[], percent: number, box: { x: number; y: number; w: number; h: number } | null, w: number, h: number): string {
  const where = box ? `Most differences are in the box x ${box.x}..${box.x + box.w}, y ${box.y}..${box.y + box.h} of the ${w}×${h} image.` : ''
  return `Fix what differs between this screenshot and the code below. Rendered at ${w}px wide, ${percent.toFixed(1)}% of the pixels differ. ${where}
Look at the image again and change only what is wrong: positions, sizes, colors, text. Return every file, whole.
${files.map((f) => `\`\`\`${f.path.endsWith('.html') ? 'html' : 'tsx'} ${f.path}\n${f.content}\n\`\`\``).join('\n')}
${RULES}`
}

/** A relative path inside the output folder: no absolute paths, no going up, plain names. */
export const safePath = (p: string) => /^(?!\/)(?!.*\.\.)[\w./-]{1,120}$/.test(p) && !p.startsWith('.')

/** The files in an answer: fenced blocks with a path on the info line; a lone html block is index.html. */
export function filesOf(answer: string, t: Target): CodeFile[] {
  const out: CodeFile[] = []
  const re = /```([\w+-]*)[ \t]*([^\n`]*)\n([\s\S]*?)```/g
  let m
  while ((m = re.exec(answer))) {
    const lang = m[1]!.toLowerCase()
    let path = m[2]!.trim().replace(/^(?:file(?:name)?[:=]\s*)/i, '')
    if (!path && (lang === 'html' || /^\s*<!doctype html|^\s*<html/i.test(m[3]!))) path = t === 'html' ? 'index.html' : 'preview.html'
    if (!path || !safePath(path)) continue
    const i = out.findIndex((f) => f.path === path)
    const file = { path, content: m[3]!.replace(/\s+$/, '\n') }
    if (i >= 0) out[i] = file
    else out.push(file)
  }
  if (!out.length && /^\s*<!doctype html|^\s*<html/i.test(answer)) out.push({ path: 'index.html', content: answer.trim() + '\n' })
  return out
}

/** The page the comparison renders: index.html for HTML, preview.html for React. */
export const entryOf = (t: Target, files: CodeFile[]) => files.find((f) => f.path === (t === 'html' ? 'index.html' : 'preview.html')) ?? files.find((f) => f.path.endsWith('.html')) ?? null

/** Stop when close enough, when the rounds or the budget run out, or when two rounds in a row did not help. */
export function shouldStop(rounds: Round[], o: { target: number; max: number }): string | null {
  const last = rounds[rounds.length - 1]
  if (!last) return null
  if (last.percent != null && last.percent <= o.target) return `Within ${o.target}%.`
  if (rounds.length >= o.max) return `Reached ${o.max} ${o.max === 1 ? 'round' : 'rounds'}.`
  const scored = rounds.filter((r) => r.percent != null)
  if (scored.length >= 3) {
    const [a, b, c] = scored.slice(-3).map((r) => r.percent!)
    if (b! >= a! - 0.2 && c! >= a! - 0.2) return 'Two rounds without progress.'
  }
  return null
}

/** The round closest to the image. */
export const best = (rounds: Round[]) => rounds.filter((r) => r.percent != null && r.files.length).sort((a, b) => a.percent! - b.percent! || a.n - b.n)[0] ?? null

/**
 * Several HTML screens as one click-through prototype: each screen saved as screen-N.html with a small
 * bar of links to the others, in the order given, and an index that opens the first.
 */
export function prototype(screens: { name: string; html: string }[]): CodeFile[] {
  const slug = (i: number) => `screen-${i + 1}.html`
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  const bar = (cur: number) =>
    `<nav style="position:fixed;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;background:#1d1d1bdd;z-index:99999;font:12px system-ui">${screens.map((s, i) => `<a href="${slug(i)}" style="color:${i === cur ? '#d97757' : '#eee'};text-decoration:none;padding:2px 8px">${esc(s.name)}</a>`).join('')}</nav>`
  const files = screens.map((s, i) => ({ path: slug(i), content: /<\/body>/i.test(s.html) ? s.html.replace(/<\/body>/i, `${bar(i)}</body>`) : `${s.html}${bar(i)}` }))
  return [...files, { path: 'index.html', content: `<!doctype html><meta http-equiv="refresh" content="0; url=${slug(0)}">` }]
}
