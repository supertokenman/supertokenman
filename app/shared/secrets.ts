// Credentials in text: known formats, and NAME=value assignments whose name says key, token, secret or password.
// Shared by the window (to stop a prompt that carries one) and the main process (to mask them in what is shown).

export type Finding = { kind: string; name: string; value: string; index: number }

const PATTERNS: { kind: string; name: string; re: RegExp }[] = [
  { kind: 'Anthropic API key', name: 'ANTHROPIC_API_KEY', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'OpenAI API key', name: 'OPENAI_API_KEY', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: 'GitHub token', name: 'GITHUB_PERSONAL_ACCESS_TOKEN', re: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|gh[ousr]_[A-Za-z0-9]{36})\b/g },
  { kind: 'Supabase access token', name: 'SUPABASE_ACCESS_TOKEN', re: /\bsbp_[a-f0-9]{40}\b/g },
  { kind: 'Neon API key', name: 'NEON_API_KEY', re: /\bnapi_[A-Za-z0-9]{40,}\b/g },
  { kind: 'Stripe key', name: 'STRIPE_SECRET_KEY', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { kind: 'AWS access key', name: 'AWS_ACCESS_KEY_ID', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'Slack token', name: 'SLACK_TOKEN', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'Google API key', name: 'GOOGLE_API_KEY', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'Private key', name: 'PRIVATE_KEY', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: 'JWT', name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: 'Database URL with password', name: 'DATABASE_URL', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/@]+:[^\s@/]{6,}@[^\s'"]+/g },
]
const ASSIGNMENT = /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD))\s*[=:]\s*["']?([^\s"'`]{12,})/g

/** Every credential found in `text`, at most once per value, in order. */
export function findSecrets(text: string, known: { name: string; value: string }[] = []): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  const add = (f: Finding) => {
    if (seen.has(f.value) || out.some((o) => f.index >= o.index && f.index < o.index + o.value.length)) return
    seen.add(f.value)
    out.push(f)
  }
  for (const k of known) {
    if (k.value.length < 8) continue
    const i = text.indexOf(k.value)
    if (i >= 0) add({ kind: 'Saved credential', name: k.name, value: k.value, index: i })
  }
  for (const p of PATTERNS) for (const m of text.matchAll(p.re)) add({ kind: p.kind, name: p.name, value: m[0], index: m.index! })
  for (const m of text.matchAll(ASSIGNMENT)) add({ kind: 'Credential', name: m[1]!, value: m[2]!, index: m.index! + m[0].lastIndexOf(m[2]!) })
  return out.sort((a, b) => a.index - b.index)
}

/** The value with its middle hidden: enough to recognize it, not to use it. */
export const mask = (v: string) => (v.length <= 12 ? '•'.repeat(v.length) : `${v.slice(0, 4)}${'•'.repeat(8)}${v.slice(-4)}`)

/** `text` with every credential masked. */
export function redact(text: string, known: { name: string; value: string }[] = []) {
  const found = findSecrets(text, known)
  // every occurrence of each value, not only where it was first found (a key printed twice stays hidden)
  let out = text
  for (const v of [...new Set(found.map((f) => f.value))].sort((a, b) => b.length - a.length)) out = out.split(v).join(mask(v))
  return { text: out, found }
}
