/** Ollama's parameter size ("751.63M", "4.0B") as a number, or null when it does not say. */
export const paramsOf = (p?: string) => {
  const m = /^([\d.]+)\s*([MB])$/i.exec(p ?? '')
  return m ? Number(m[1]) * (m[2]!.toUpperCase() === 'B' ? 1e9 : 1e6) : null
}
/** Below this, a model misreads files often enough that its answers cannot be trusted for reading. */
export const READ_MIN_PARAMS = 3e9
