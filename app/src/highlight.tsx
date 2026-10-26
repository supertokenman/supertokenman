// A light syntax colouring for code in replies: comments, strings, numbers, keywords and calls.
// Not a parser; one pass of regular expressions per language family, enough to read code at a glance.
import type { ReactNode } from 'react'

const KEYWORDS = new Set(
  `as async await break case catch class const continue def default del do elif else enum except export extends false fi finally fn for from func function go if impl import in interface is let match mod new nil none null of package pass pub raise return self static struct super switch then this throw true try type typeof undefined use var void while with yield
  echo local readonly done esac`.split(/\s+/),
)
// languages whose comments start with #, and those that also read // and /* */
const HASH = /^(sh|bash|zsh|shell|console|py|python|rb|ruby|yaml|yml|toml|dockerfile|make|makefile|r|perl|ini|conf|env)$/
const PLAIN = /^(txt|text|plain|md|markdown|log|output|diff)$/

/** Splits a fence's info into a language and a file name: ```ts, ```ts title="a.ts", ```ts:a.ts, ```src/a.ts */
export function fenceInfo(info: string): { lang: string; file?: string } {
  const t = info.trim()
  const title = /title=["']?([^"'\s]+)/.exec(t)?.[1]
  const [head, after] = t.split(/\s+/, 1)[0]!.split(':') as [string, string | undefined]
  const file = title ?? after ?? (/[./]/.test(head) && /\.\w+$/.test(head) ? head : undefined)
  const lang = file && !after && !title ? (/\.(\w+)$/.exec(file)?.[1] ?? '') : head
  return { lang: lang.toLowerCase(), ...(file ? { file } : {}) }
}

export function highlight(code: string, lang: string): ReactNode[] {
  if (PLAIN.test(lang) || code.length > 40_000) return [code]
  const hash = HASH.test(lang)
  const json = lang === 'json'
  const comment = hash ? String.raw`#[^\n]*` : json ? '(?!)' : String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/|--\s[^\n]*`
  const re = new RegExp(`(${comment})|("(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d[\\d_.]*(?:e[+-]?\\d+)?[a-z]*\\b|\\b0x[\\da-f]+\\b)|([A-Za-z_$][\\w$]*)(\\s*\\()?`, 'gi')
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of code.matchAll(re)) {
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : m[4] && KEYWORDS.has(m[4]) ? 'k' : m[4] && m[5] ? 'f' : ''
    if (!cls) continue
    if (m.index! > last) out.push(code.slice(last, m.index))
    const text = cls === 'f' ? m[4]! : m[0]
    out.push(<span key={n++} className={`hl-${cls}`}>{text}</span>)
    last = m.index! + text.length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}
