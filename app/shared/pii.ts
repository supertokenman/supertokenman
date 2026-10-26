// Phase 105: personal data in a document's text, found before it goes to a model: CPF, CNPJ, e-mail,
// phone numbers and card numbers (checked by their digits, so ordinary numbers are not taken).

export type Pii = { kind: 'cpf' | 'cnpj' | 'email' | 'phone' | 'card'; text: string }

const digits = (s: string) => s.replace(/\D/g, '')
function cpfOk(s: string) {
  const d = digits(s)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const dv = (n: number) => { let t = 0; for (let i = 0; i < n; i++) t += Number(d[i]) * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}
function cnpjOk(s: string) {
  const d = digits(s)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const dv = (n: number) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const t = w.reduce((a, x, i) => a + x * Number(d[i]), 0); const r = t % 11; return r < 2 ? 0 : 11 - r }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}
function luhn(s: string) {
  const d = digits(s)
  if (d.length < 13 || d.length > 19) return false
  let t = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2
    t += n
  }
  return t % 10 === 0
}

export function findPii(text: string): Pii[] {
  const out: Pii[] = []
  const add = (kind: Pii['kind'], t: string) => !out.some((p) => p.text === t) && out.push({ kind, text: t })
  for (const m of text.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)) if (cnpjOk(m[0])) add('cnpj', m[0])
  for (const m of text.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g)) if (cpfOk(m[0])) add('cpf', m[0])
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) add('email', m[0])
  for (const m of text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) if (luhn(m[0])) add('card', m[0].trim())
  for (const m of text.matchAll(/(?:\+55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g)) if (!out.some((p) => p.text.includes(m[0].trim()) || m[0].includes(p.text))) add('phone', m[0].trim())
  return out
}
