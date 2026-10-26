// Corrections become rules: a message that corrects the panel ("no, use pnpm", "nunca rode migrations
// sem perguntar") is offered as a standing rule for the persona or the project, so it is said once.

export type Correction = { rule: string }

const LEAD = /^(?:no|nope|não|nao|errado|wrong|actually|na verdade|pare de|stop|para de)\b[,.!:\s-]*/i
const STANDING = /\b(?:always|never|don'?t ever|do not ever|from now on|sempre|nunca|jamais|daqui pra frente|de agora em diante|a partir de agora|prefer|prefira|instead of|em vez de|ao inv[eé]s de)\b/i
const IMPERATIVE = /^(?:use|usa|use o|use a|prefer|prefira|don'?t|do not|não|nao|nunca|never|always|sempre|stop|pare|avoid|evite|keep|mantenha|put|coloque|write|escreva|run|rode)\b/i

/** The standing rule a message states, if it reads as a correction or a rule; null otherwise. */
export function correctionOf(text: string): Correction | null {
  const t = text.trim()
  if (!t || t.length > 400 || t.includes('\n\n') || t.endsWith('?')) return null
  const led = LEAD.test(t)
  const body = t.replace(LEAD, '').trim()
  if (body.length < 6) return null
  if (!(STANDING.test(t) || (led && IMPERATIVE.test(body)))) return null
  const rule = body.charAt(0).toUpperCase() + body.slice(1)
  return { rule: /[.!]$/.test(rule) ? rule : `${rule}.` }
}

/** The instructions with a rule added under a Rules heading, once. */
export function withRule(instructions: string, rule: string): string {
  if (instructions.includes(rule)) return instructions
  const head = '\n\nRules the person set:\n'
  return instructions.includes(head) ? `${instructions.trimEnd()}\n- ${rule}` : `${instructions.trimEnd()}${head}- ${rule}`
}
