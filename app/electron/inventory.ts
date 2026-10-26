// The component inventory: every React, Vue and Svelte component in a project, with its file, its props
// and where it is used; components that look like the same thing under different names; and the ones
// nothing uses. Read from the files alone, nothing runs.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'

export type Component = { name: string; file: string; line: number; props: string[]; uses: number; usedIn: string[]; /** mentions by name that are not tags: passed as a value, in a map, re-exported */ refs: number }
export type Inventory = { components: Component[]; lookalikes: { key: string; names: string[] }[]; unused: string[]; files: number }

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', 'out', 'coverage', '.turbo', 'dist-electron', 'release'])
const EXT = ['.tsx', '.jsx', '.vue', '.svelte']
// files a framework renders by itself: not "unused" when nothing imports them
const ROUTE = /(^|\/)(pages|app|routes)\/|(^|\/)(page|layout|loading|error|not-found|template|\+page|\+layout|App|main|index)\.(tsx|jsx|vue|svelte)$/

export function walk(dir: string, max = 4000): string[] {
  const out: string[] = []
  const go = (d: string) => {
    let names: string[]
    try {
      names = readdirSync(d)
    } catch {
      return
    }
    for (const n of names) {
      if (out.length >= max) return
      if (SKIP.has(n) || n.startsWith('.')) continue
      const p = join(d, n)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) go(p)
      else if ([...EXT, '.ts', '.js'].includes(extname(n)) && st.size < 400_000 && !/\.(test|spec|stories|d)\.[jt]sx?$/.test(n)) out.push(p)
    }
  }
  go(dir)
  return out
}

const keysOf = (body: string) => [...body.matchAll(/(?:^|[;,{\n])\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/g)].map((m) => m[1]!).filter((k, i, a) => a.indexOf(k) === i)

/** The components a file defines, with their props. */
export function componentsIn(file: string, text: string): Omit<Component, 'uses' | 'usedIn' | 'refs'>[] {
  const ext = extname(file)
  const lineOf = (i: number) => text.slice(0, i).split('\n').length
  if (ext === '.vue' || ext === '.svelte') {
    const name = basename(file, ext)
    const typed = /defineProps<\{([\s\S]*?)\}>/.exec(text)?.[1]
    const obj = /defineProps\(\s*\{([\s\S]*?)\}\s*\)/.exec(text)?.[1]
    const svelte = [...text.matchAll(/export\s+let\s+(\w+)/g)].map((m) => m[1]!)
    const runes = /let\s*\{([^}]*)\}\s*=\s*\$props\(\)/.exec(text)?.[1]
    const props = typed ? keysOf(typed) : obj ? keysOf(obj) : svelte.length ? svelte : runes ? runes.split(',').map((x) => x.split(/[=:]/)[0]!.trim()).filter(Boolean) : []
    return [{ name, file, line: 1, props }]
  }
  if (ext !== '.tsx' && ext !== '.jsx') return []
  const out: Omit<Component, 'uses' | 'usedIn' | 'refs'>[] = []
  const types = new Map<string, string[]>()
  // prop types on several lines (closed at the start of a line) or on one
  for (const m of text.matchAll(/(?:type\s+(\w+)\s*=\s*\{|interface\s+(\w+)(?:\s+extends[^{]+)?\s*\{)([\s\S]*?)\n\}/g)) types.set((m[1] ?? m[2])!, keysOf(m[3]!))
  for (const m of text.matchAll(/(?:type\s+(\w+)\s*=\s*\{|interface\s+(\w+)(?:\s+extends[^{]+)?\s*\{)([^\n{}]*)\}/g)) if (!types.has((m[1] ?? m[2])!)) types.set((m[1] ?? m[2])!, keysOf(m[3]!))
  const re = /(?:export\s+(?:default\s+)?)?(?:function\s+([A-Z]\w*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:memo\(|forwardRef\()?(?:\(([^)]*)\)|(\w+))\s*(?::[^=]+)?=>)/g
  for (const m of text.matchAll(re)) {
    const name = (m[1] ?? m[3])!
    const params = (m[2] ?? m[4] ?? m[5] ?? '').trim()
    // a component returns JSX: look for a tag soon after it starts
    const after = text.slice(m.index!, m.index! + 4000)
    if (!/return\s*\(?\s*<|=>\s*\(?\s*<|<[A-Za-z>]/.test(after)) continue
    let props: string[] = []
    const inline = /^\{([\s\S]*?)\}\s*(?::\s*(?:\{([\s\S]*)\}|(\w+)))?$/.exec(params)
    const typed = /:\s*\{([\s\S]*)\}\s*$/.exec(params)
    const named = /:\s*(\w+)\s*$/.exec(params)
    if (inline) props = inline[2] ? keysOf(inline[2]) : inline[3] ? (types.get(inline[3]) ?? []) : inline[1]!.split(',').map((x) => x.split(/[=:]/)[0]!.replace('...', '').trim()).filter(Boolean)
    else if (typed) props = keysOf(typed[1]!)
    else if (named) props = types.get(named[1]!) ?? []
    out.push({ name, file, line: lineOf(m.index!), props })
  }
  return out
}

const STEM: [RegExp, string][] = [[/^(?:base|primary|secondary|custom|my|new|app|ui|simple|default|styled)/i, ''], [/(?:component|wrapper|container|view|new|v2|old)$/i, ''], [/^btn$/i, 'button'], [/^dialog$/i, 'modal'], [/^popup$/i, 'modal'], [/^img$/i, 'image'], [/^icn$/i, 'icon']]
export function stemOf(name: string): string {
  let s = name
  for (const [re, to] of STEM) s = s.replace(re, to)
  return (s || name).toLowerCase()
}

export function inventory(root: string): Inventory {
  const files = walk(root)
  const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))
  const defs = files.flatMap((f) => componentsIn(relative(root, f), texts.get(f)!))
  const components: Component[] = defs.map((d) => {
    const tag = new RegExp(`<${d.name}[\\s/>]`, 'g')
    const word = new RegExp(`\\b${d.name}\\b`, 'g')
    const usedIn: string[] = []
    let uses = 0
    let refs = 0
    for (const [f, t] of texts) {
      const n = (t.match(tag) ?? []).length
      if (n) (uses += n), usedIn.push(relative(root, f))
      // other mentions by name, minus imports, exports and the definition itself
      const lines = t.split('\n').filter((l, i) => !/^\s*(import|export\s*\{|export\s+\*)/.test(l) && !(relative(root, f) === d.file && i === d.line - 1))
      refs += lines.reduce((a, l) => a + (l.match(word) ?? []).length - (l.match(tag) ?? []).length, 0)
    }
    return { ...d, uses, usedIn, refs: Math.max(0, refs) }
  })
  const groups = new Map<string, Set<string>>()
  for (const c of components) groups.set(stemOf(c.name), (groups.get(stemOf(c.name)) ?? new Set()).add(c.name))
  return {
    components: components.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)),
    lookalikes: [...groups.entries()].filter(([, n]) => n.size > 1).map(([key, n]) => ({ key, names: [...n].sort() })),
    unused: components.filter((c) => c.uses === 0 && c.refs === 0 && !ROUTE.test(c.file)).map((c) => c.name),
    files: files.length,
  }
}

/** What Claude is asked to do with the look-alikes: compare and propose one, change nothing yet. */
export const consolidateMessage = (inv: Inventory, key: string) => {
  const g = inv.lookalikes.find((x) => x.key === key)
  if (!g) return ''
  const rows = g.names.map((n) => inv.components.find((c) => c.name === n)!).map((c) => `- ${c.name} in ${c.file}:${c.line}, props ${c.props.join(', ') || 'none'}, used ${c.uses} times`)
  return `These components look like the same thing under different names:\n${rows.join('\n')}\n\nRead them, say how they differ, and propose one component that covers what each is used for, with the migration of every use. Do not change files yet.`
}
