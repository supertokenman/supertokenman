// A panel's goal: a condition for done, given with /goal. Each message to the panel carries it, and
// the panel says GOAL MET when the condition holds, which ends the goal.

export type Goal = { text: string; at: number }

/** /goal <condition> sets it, /goal clear (or off, done) ends it, /goal alone asks what it is. */
export function goalCommand(input: string): { set: string } | { clear: true } | { show: true } | null {
  const m = /^\/goal(?:\s+([\s\S]*))?$/i.exec(input.trim())
  if (!m) return null
  const arg = (m[1] ?? '').trim()
  if (!arg) return { show: true }
  if (/^(clear|off|done|stop|limpar)$/i.test(arg)) return { clear: true }
  return { set: arg.slice(0, 600) }
}

/** The message with the goal in front, so Claude sees it every turn without changing the system prompt. */
export const withGoal = (text: string, g: Goal | null) => (g ? `[Goal of this panel: ${g.text}. Work toward it. When it is met, and only then, end your reply with a line "GOAL MET".]\n\n${text}` : text)

/** Whether a reply says the goal is met: its own line, at the end. */
export const goalMet = (reply: string) => /(?:^|\n)\s*\**GOAL MET\**\.?\s*$/.test(reply.trim())
