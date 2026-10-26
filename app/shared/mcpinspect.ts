// The MCP inspector, the parts with no connection: whether a tool reads or writes (its annotations
// first, its name second), a form built from a tool's input schema and the values it gives back, how
// much context a server's tool list takes, and a tool description checked for text that gives orders.

import { roughTokens } from './trace.js'

export type Tool = { name: string; description?: string; inputSchema?: Schema; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean; title?: string } }
export type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; description?: string; enum?: unknown[]; default?: unknown; items?: Schema }

const WRITE = /^(create|add|insert|update|edit|set|put|patch|delete|remove|drop|destroy|write|send|post|publish|deploy|run|exec|execute|apply|merge|move|rename|upload|cancel|stop|kill|restart|approve|close|archive|transfer|pay|charge)/i

/** read: safe to try; write: changes something or reaches out; the annotations win when present. */
export function classOf(t: Tool): 'read' | 'write' {
  const a = t.annotations
  if (a?.readOnlyHint === true) return 'read'
  if (a?.readOnlyHint === false || a?.destructiveHint === true) return 'write'
  const words = t.name.replace(/([a-z])([A-Z])/g, '$1_$2').split(/[_\-.\s]+/)
  return words.some((w) => WRITE.test(w)) ? 'write' : 'read'
}

export type Field = { name: string; kind: 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'json'; required: boolean; description?: string; options?: string[]; default?: unknown }
const kindOf = (s: Schema): Field['kind'] => {
  if (s.enum?.length) return 'enum'
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type
  return t === 'number' || t === 'integer' || t === 'boolean' || t === 'string' ? t : 'json'
}
/** The form for a tool: one field per top-level property; objects and arrays are edited as JSON. */
export function fieldsOf(schema?: Schema): Field[] {
  const req = new Set(schema?.required ?? [])
  return Object.entries(schema?.properties ?? {}).map(([name, s]) => ({ name, kind: kindOf(s), required: req.has(name), ...(s.description ? { description: s.description } : {}), ...(s.enum ? { options: s.enum.map(String) } : {}), ...(s.default !== undefined ? { default: s.default } : {}) }))
}

/** The form's text values as the tool's arguments; an empty optional field is left out. */
export function argsOf(fields: Field[], values: Record<string, string>): { args: Record<string, unknown>; error?: string } {
  const args: Record<string, unknown> = {}
  for (const f of fields) {
    const v = (values[f.name] ?? '').trim()
    if (!v) {
      if (f.required) return { args, error: `${f.name} is required.` }
      continue
    }
    if (f.kind === 'number' || f.kind === 'integer') {
      const n = Number(v)
      if (!Number.isFinite(n) || (f.kind === 'integer' && !Number.isInteger(n))) return { args, error: `${f.name} must be ${f.kind === 'integer' ? 'a whole number' : 'a number'}.` }
      args[f.name] = n
    } else if (f.kind === 'boolean') args[f.name] = v === 'true'
    else if (f.kind === 'json') {
      try {
        args[f.name] = JSON.parse(v)
      } catch {
        return { args, error: `${f.name} must be JSON.` }
      }
    } else args[f.name] = v
  }
  return { args }
}

/** About how many tokens a server's tool list adds to every turn. */
export const listTokens = (tools: Tool[]) => roughTokens(JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))))

const ORDERS = /\b(ignore (all |any )?(previous|prior|above)|disregard|you must (always|never)|do not tell the user|without (asking|telling)|always call this tool|before (using|calling) any other tool|<important>|system prompt|exfiltrat|send (the|all|any) (file|key|secret|token)|~\/\.ssh|\.env\b|id_rsa)/i
/** Text in a tool description that tries to steer the model rather than describe the tool. */
export function suspicious(t: Tool): string[] {
  const text = `${t.description ?? ''} ${JSON.stringify(t.inputSchema ?? {})}`
  const out: string[] = []
  const m = ORDERS.exec(text)
  if (m) out.push(`Says "${m[0]}"`)
  if ((t.description ?? '').length > 2000) out.push(`A long description (${(t.description ?? '').length} characters)`)
  if (/[​-‏‪-‮⁦-⁩]/.test(text)) out.push('Has hidden characters')
  return out
}
