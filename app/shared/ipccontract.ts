// The IPC contract for the channels that touch secrets, run commands or write files (phase 81): the
// arguments each may receive, checked in the main process before the handler runs. Other channels
// keep their own checks; this list grows by area. A call with arguments outside the contract is
// refused with what was wrong.
import { z } from 'zod'

const sid = z.string().regex(/^[\w-]{1,64}$/, 'a panel id')
const name = z.string().regex(/^[\w][\w .:-]{0,99}$/, 'a secret name (letters, digits, space, _ . : -)')
const text = (max: number) => z.string().max(max)
const opt = <T extends z.ZodType>(t: T) => t.optional()

export const CONTRACT: Record<string, z.ZodTuple | z.ZodType<unknown[]>> = {
  'vault:list': z.tuple([]),
  'vault:set': z.tuple([name, text(100_000).min(1), opt(z.boolean())]),
  'vault:delete': z.tuple([name]),
  'vault:forCommands': z.tuple([name, z.boolean()]),
  'shell:run': z.tuple([sid, text(100_000).min(1)]),
  'shell:stop': z.tuple([sid, z.string().max(100)]),
  'term:open': z.tuple([sid, z.number().int().min(1).max(1000), z.number().int().min(1).max(1000)]),
  'term:type': z.tuple([sid, text(100_000), z.boolean(), opt(z.boolean())]),
  'term:connect': z.tuple([sid, text(2000).min(1)]),
  'chat:send': z.tuple([sid, text(2_000_000), opt(z.unknown()), opt(text(300))]),
  'chat:model': z.tuple([sid, z.string().regex(/^claude-(haiku|sonnet|opus)-[\w-]+$/)]),
  'quota:set': z.tuple([sid, z.enum(['setup', 'plan', 'api', 'custom']), z.number().int().min(0).max(2)]),
  'quota:custom': z.tuple([z.boolean(), z.string().max(300)]),
  'bw:unlock': z.tuple([z.string().min(1).max(1000)]),
  'bw:link': z.tuple([z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/), z.string().min(1).max(100), z.string().max(80), z.string().max(80)]),
  'perm:answer': z.tuple([sid, z.string().max(100), z.boolean()]),
  'iso:start': z.tuple([sid, z.string().regex(/^[\w./:@-]{1,200}$/)]),
  'iso:stop': z.tuple([sid]),
  'iso:network': z.tuple([sid, z.boolean()]),
  'export:text': z.tuple([z.string().min(1).max(200), text(20_000_000), z.string().max(4096).nullable().optional()]),
  'sdraft:import': z.tuple([z.string().url().max(2000), z.string().max(4096)]),
  'sdraft:approve': z.tuple([z.string().max(100), z.object({ name: z.string(), description: z.string(), body: z.string() }), z.enum(['project', 'personal']), z.boolean(), opt(z.number().int().min(0))]),
  'msgf:save': z.tuple([z.object({ code: text(20_000) }).loose()]),
  'msgf:test': z.tuple([text(20_000), z.enum(['inlet', 'outlet']), text(1_000_000), z.record(z.string(), z.unknown())]),
  'phone:send': z.tuple([z.boolean()]),
  'mcpsrv:send': z.tuple([z.boolean()]),
  'panel:linkAuto': z.tuple([sid, sid, z.boolean()]),
  'pb:run': z.tuple([sid, z.string().regex(/^[\w.-]+\.ya?ml$/), opt(z.string().max(100))]),
}

/** Null when the arguments fit, else what is wrong, for the error the window sees. */
export function checkArgs(channel: string, args: unknown[]): string | null {
  const c = CONTRACT[channel]
  if (!c) return null
  // optional trailing arguments may be left out
  const r = c.safeParse(args)
  if (r.success) return null
  return r.error.issues.map((i) => `argument ${i.path.join('.') || '?'}: ${i.message}`).join('; ')
}
