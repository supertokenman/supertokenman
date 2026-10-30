// What an audit row may say about a tool call: the summary with credentials masked and at most 300 characters.
// Masking runs before the cap, so a secret cut at the boundary can never leak its start.

import { mask, redact } from './secrets.js'

export const ARGS_MAX = 300

const ENV_ASSIGN = /\b([A-Z][A-Z0-9_]*)=("[^"]*"|'[^']*'|[^\s"']+)/g
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/g

/** The summary of a call's arguments, safe to write to the audit log. */
export function redactArgs(text: string, known: { name: string; value: string }[] = []): string {
  let s = redact(text, known).text
  s = s.replace(BEARER, (m) => `Bearer ${mask(m.slice(7))}`)
  s = s.replace(URL_USERINFO, (_m, scheme: string) => `${scheme}•••@`)
  s = s.replace(ENV_ASSIGN, (_m, name: string, value: string) => `${name}=${mask(value.replace(/^["']|["']$/g, ''))}`)
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > ARGS_MAX ? `${s.slice(0, ARGS_MAX - 1)}…` : s
}
