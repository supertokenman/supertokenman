// The state of a setup guide made of steps. A step is done when the app can see it happened: the
// person opened its page, copied its value, filled its field, or the app checked it (Ollama found).
export interface StepLike {
  id: string
  /** true when the app itself can see the step is complete (a field filled, a tool installed) */
  done?: boolean
  /** a step with nothing to do (no open, copy, field or check) counts as done once a later step is */
  passive?: boolean
}

export interface StepProgress {
  done: Set<string>
  /** the first step not done yet; null when all are done */
  current: string | null
  count: number
  total: number
}

/** Which steps are done, given the steps and what the person did (ids of steps opened or copied). */
export function stepProgress(steps: StepLike[], acted: Iterable<string>): StepProgress {
  const did = new Set(acted)
  const done = new Set<string>()
  steps.forEach((s) => (s.done || did.has(s.id)) && done.add(s.id))
  // a passive step (just read this) is done once anything after it is done
  let later = false
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (done.has(s.id)) later = true
    else if (s.passive && later) done.add(s.id)
  }
  const current = steps.find((s) => !done.has(s.id))?.id ?? null
  return { done, current, count: done.size, total: steps.length }
}
