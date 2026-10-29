// Bench variants. A = old guide, B = capability card, C = B with terse inter-agent mode on, D = B with output
// condensing on. The runner sets BENCH_VARIANT and the variables the app reads in a development run
// (app/shared/variant.ts); a packaged app ignores them. A feature a variant does not name is off, so each
// variant differs from B in one thing only.

export const VARIANTS = {
  A: { STM_PROMPT_VARIANT: 'old', STM_TERSE: '0', STM_CONDENSE: '0' },
  B: { STM_PROMPT_VARIANT: 'card', STM_TERSE: '0', STM_CONDENSE: '0' },
  C: { STM_PROMPT_VARIANT: 'card', STM_TERSE: '1', STM_CONDENSE: '0' },
  D: { STM_PROMPT_VARIANT: 'card', STM_TERSE: '0', STM_CONDENSE: '1' },
};

export const isVariant = (v) => typeof v === 'string' && Object.hasOwn(VARIANTS, v);

/** The variant to run: --variant wins over BENCH_VARIANT in the environment. */
export function pickVariant(flag, env = process.env) {
  const v = flag ?? env.BENCH_VARIANT;
  return isVariant(v) ? v : null;
}

/** Environment for the child process of one run. */
export const variantEnv = (v) => ({ BENCH_VARIANT: v, ...VARIANTS[v] });
