// Benchmark variants (bench/README.md), read from the environment in a development run only. A packaged app
// ignores them, so nobody gets a different prompt by setting a variable.
// STM_PROMPT_VARIANT=old|card picks the guide; STM_TERSE and STM_CONDENSE=1|0 force those two settings.

export type Variant = { guide: 'card' | 'old'; terse?: boolean; condense?: boolean }

export function variantOf(env: Record<string, string | undefined>, packaged: boolean): Variant {
  if (packaged) return { guide: 'card' }
  const flag = (v: string | undefined) => (v === '1' ? true : v === '0' ? false : undefined)
  return { guide: env.STM_PROMPT_VARIANT === 'old' ? 'old' : 'card', terse: flag(env.STM_TERSE), condense: flag(env.STM_CONDENSE) }
}
