// The policy rule file: one rule per line, `#` comments. Parsed here, evaluated by policygate.ts.
//
//   rule := effect SP tool [SP "when" SP cond ("and" cond)*] [SP "unless" SP cond ("and" cond)*] [SP "--" SP note]
//
// A line that does not parse is reported with its line number and dropped; it never becomes an allow.

export type Effect = 'deny' | 'ask' | 'allow'
export type Op = 'is' | 'matches' | 'has' | 'inside' | 'outside'
export type Field = 'cmd' | 'path' | 'branch' | 'host' | `arg.${string}`
/** `text` is the literal value; `quoted` values are never variables, so "$project" is the text, not the project folder. */
export type Value = { text: string; quoted: boolean }
export type Cond = { field: Field; op: Op; value: Value }
export type Rule = { line: number; effect: Effect; tool: string; when: Cond[]; unless: Cond[]; note: string }
export type RuleError = { line: number; message: string }
export type ParseResult = { rules: Rule[]; errors: RuleError[] }

const EFFECTS: readonly Effect[] = ['deny', 'ask', 'allow']
const OPS: readonly Op[] = ['is', 'matches', 'has', 'inside', 'outside']
const FIXED_FIELDS = new Set(['cmd', 'path', 'branch', 'host'])
const ARG_FIELD = /^arg\.[A-Za-z_][\w-]*$/

type Token = { text: string; quoted: boolean; start: number; end: number }

class SyntaxErr extends Error {}

/** Splits one line into words and quoted strings. Quoted strings take \" and \\ escapes. */
function tokenize(line: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < line.length) {
    const c = line[i]!
    if (/\s/.test(c)) { i++; continue }
    const start = i
    if (c === '"') {
      let text = ''
      i++
      let closed = false
      while (i < line.length) {
        const d = line[i]!
        if (d === '\\' && i + 1 < line.length && (line[i + 1] === '"' || line[i + 1] === '\\')) { text += line[i + 1]; i += 2; continue }
        if (d === '"') { closed = true; i++; break }
        text += d
        i++
      }
      if (!closed) throw new SyntaxErr(`unclosed quote at column ${start + 1}`)
      out.push({ text, quoted: true, start, end: i })
    } else {
      while (i < line.length && !/\s/.test(line[i]!)) {
        if (line[i] === '"') throw new SyntaxErr(`quote inside a bare word at column ${i + 1}`)
        i++
      }
      out.push({ text: line.slice(start, i), quoted: false, start, end: i })
    }
  }
  return out
}

/** Parses one rule line (already known not to be blank or a comment). Throws SyntaxErr with the reason. */
function parseTokens(line: string): Omit<Rule, 'line'> {
  const toks = tokenize(line)
  let note = ''
  const noteAt = toks.findIndex((t) => !t.quoted && t.text === '--')
  let body = toks
  if (noteAt >= 0) {
    note = line.slice(toks[noteAt]!.end).trim()
    body = toks.slice(0, noteAt)
  }
  let k = 0
  const peek = () => body[k]
  const next = (what: string) => {
    const t = body[k]
    if (!t) throw new SyntaxErr(`expected ${what} at the end of the line`)
    k++
    return t
  }
  const effectTok = next('deny, ask or allow')
  if (effectTok.quoted || !EFFECTS.includes(effectTok.text as Effect)) throw new SyntaxErr(`expected deny, ask or allow, got "${effectTok.text}"`)
  const toolTok = next('a tool name')
  if (toolTok.quoted || ['when', 'unless', 'and'].includes(toolTok.text)) throw new SyntaxErr(`expected a tool name, got "${toolTok.text}"`)

  const cond = (): Cond => {
    const f = next('a field (cmd, path, branch, host or arg.<key>)')
    if (f.quoted || !(FIXED_FIELDS.has(f.text) || ARG_FIELD.test(f.text))) throw new SyntaxErr(`unknown field "${f.text}"`)
    const o = next('an operator (is, matches, has, inside, outside)')
    if (o.quoted || !OPS.includes(o.text as Op)) throw new SyntaxErr(`unknown operator "${o.text}"`)
    const v = next('a value')
    if (!v.quoted && v.text === '--') throw new SyntaxErr('expected a value, got "--"')
    return { field: f.text as Field, op: o.text as Op, value: { text: v.text, quoted: v.quoted } }
  }
  const conds = (): Cond[] => {
    const list = [cond()]
    while (peek() && !peek()!.quoted && peek()!.text === 'and') { k++; list.push(cond()) }
    return list
  }

  let when: Cond[] = []
  let unless: Cond[] = []
  const kw = peek()
  if (kw && !kw.quoted && kw.text === 'when') { k++; when = conds() }
  const kw2 = peek()
  if (kw2 && !kw2.quoted && kw2.text === 'unless') { k++; unless = conds() }
  if (peek()) throw new SyntaxErr(`unexpected "${peek()!.text}"`)
  return { effect: effectTok.text as Effect, tool: toolTok.text, when, unless, note }
}

/** One line to a rule, or the reason it is not one. */
export function parseRule(line: string, lineNo = 1): Rule | RuleError {
  try {
    return { line: lineNo, ...parseTokens(line) }
  } catch (e) {
    return { line: lineNo, message: e instanceof SyntaxErr ? e.message : String(e) }
  }
}

/** A whole rule file. Blank lines and `#` comments are skipped; invalid lines are listed in `errors` and left out of `rules`. */
export function parseRules(text: string): ParseResult {
  const rules: Rule[] = []
  const errors: RuleError[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const r = parseRule(line, i + 1)
    if ('message' in r) errors.push(r)
    else rules.push(r)
  })
  return { rules, errors }
}

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const formatValue = (v: Value) => (v.quoted ? quote(v.text) : v.text)
const formatCond = (c: Cond) => `${c.field} ${c.op} ${formatValue(c.value)}`

/** The canonical text of a rule (without its line number). Parsing the result gives the same rule. */
export function formatRule(r: Omit<Rule, 'line'> | Rule): string {
  let s = `${r.effect} ${r.tool}`
  if (r.when.length) s += ` when ${r.when.map(formatCond).join(' and ')}`
  if (r.unless.length) s += ` unless ${r.unless.map(formatCond).join(' and ')}`
  if (r.note) s += ` -- ${r.note}`
  return s
}
