// Tool receipts: each tool call a panel makes goes into a log where every line is chained to the one
// before by an HMAC with a key kept in the vault. Editing or removing a line breaks the chain from
// there on, so the log shows whether it is the one the app wrote.
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type Receipt = { at: number; panel: string; project: string; tool: string; input: string; output: string; prev: string; mac: string; turn?: string }

const digest = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32)
// the turn id joins the signed fields only when there is one, so lines written before it still check out
const macOf = (key: string, r: Omit<Receipt, 'mac'>) => createHmac('sha256', key).update(JSON.stringify([r.at, r.panel, r.project, r.tool, r.input, r.output, r.prev, ...(r.turn ? [r.turn] : [])])).digest('hex')

export const newKey = () => randomBytes(32).toString('hex')

function lastMac(file: string): string {
  try {
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n')
    return (JSON.parse(lines[lines.length - 1]!) as Receipt).mac
  } catch {
    return 'start'
  }
}

/** Adds one tool call; the input and output are kept as digests only, never their text. */
export function addReceipt(file: string, key: string, r: { panel: string; project: string; tool: string; input: unknown; output: string; turn?: string }, at = Date.now()): Receipt {
  const base = { at, panel: r.panel, project: r.project, tool: r.tool, input: digest(JSON.stringify(r.input ?? {})), output: digest(r.output ?? ''), prev: lastMac(file), ...(r.turn ? { turn: r.turn } : {}) }
  const rec = { ...base, mac: macOf(key, base) }
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(rec)}\n`)
  return rec
}

/** Checks the whole chain: how many lines, and the first one that does not match, if any. */
export function verify(file: string, key: string): { count: number; brokenAt: number | null } {
  let lines: string[]
  try {
    lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
  } catch {
    return { count: 0, brokenAt: null }
  }
  let prev = 'start'
  for (let i = 0; i < lines.length; i++) {
    let r: Receipt
    try {
      r = JSON.parse(lines[i]!) as Receipt
    } catch {
      return { count: lines.length, brokenAt: i + 1 }
    }
    const { mac, ...rest } = r
    if (r.prev !== prev || macOf(key, rest) !== mac) return { count: lines.length, brokenAt: i + 1 }
    prev = mac
  }
  return { count: lines.length, brokenAt: null }
}
