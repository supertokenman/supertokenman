// One short line on messages that go from one panel to another (stm ask, send, room turns, review loop
// steps), so the answer comes back in few words. Never added to what the person types.

export const TERSE_LINE = 'Reply tersely: facts, file paths, next step; no pleasantries.'

export const tersed = (text: string, on: boolean) => (on && !text.includes(TERSE_LINE) ? `${text.trimEnd()}\n\n${TERSE_LINE}` : text)
