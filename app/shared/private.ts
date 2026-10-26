// <private>…</private>: what the person marks as private is sent to Claude, but never kept: not in the
// project's note, the brief, a session summary or a decision.

const PRIVATE = /<private>[\s\S]*?(<\/private>|$)/gi

/** The text with every private part replaced by a marker that says something was left out. */
export const stripPrivate = (text: string) => text.replace(PRIVATE, '[private]')
