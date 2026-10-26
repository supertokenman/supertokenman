// The workbench in the main process: your prompt library in userData with versions, the prompts.chat
// collection (CC0) downloaded only when you ask and kept apart as a catalog, and filters per persona.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILTERS, fromPromptsChat, searchPrompts, slug, withVersion, type Filter, type Prompt } from '../shared/workbench.js'

const CSV = process.env.STM_PROMPTS_CSV ?? 'https://raw.githubusercontent.com/f/prompts.chat/main/prompts.csv'
type Store = { prompts: Prompt[]; filters: Record<string, Filter[]>; catalogAt?: number }

export function workbench(dir: () => string) {
  const file = () => join(dir(), 'workbench.json')
  const catFile = () => join(dir(), 'prompts-chat.json')
  const read = (): Store => {
    try {
      return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Store) : { prompts: [], filters: {} }
    } catch {
      return { prompts: [], filters: {} }
    }
  }
  const write = (s: Store) => writeFileSync(file(), JSON.stringify(s, null, 1))
  let catalog: Prompt[] | null = null
  const cat = () => {
    if (catalog) return catalog
    try {
      catalog = existsSync(catFile()) ? (JSON.parse(readFileSync(catFile(), 'utf8')) as Prompt[]) : []
    } catch {
      catalog = []
    }
    return catalog
  }
  const state = () => {
    const s = read()
    return { prompts: s.prompts, filters: s.filters, catalogCount: cat().length, catalogAt: s.catalogAt ?? null, filterNames: Object.fromEntries(Object.entries(FILTERS).map(([k, v]) => [k, v.label])) }
  }
  const save = (p: Partial<Prompt>, note?: string) => {
    const s = read()
    const name = slug(p.name || p.title || '')
    if (!p.body?.trim()) throw new Error('A prompt needs text.')
    if (s.prompts.some((x) => x.name === name && x.id !== p.id)) throw new Error(`/${name} is taken; pick another name.`)
    const old = s.prompts.find((x) => x.id === p.id)
    const next = withVersion(old, { id: p.id || `p${Date.now().toString(36)}`, name, title: (p.title || name).trim().slice(0, 80), body: p.body.slice(0, 20_000), tags: (p.tags ?? []).map((t) => slug(t)).filter(Boolean).slice(0, 8), ...(p.source ? { source: p.source } : {}), at: Date.now() }, note)
    write({ ...s, prompts: old ? s.prompts.map((x) => (x.id === next.id ? next : x)) : [next, ...s.prompts] })
    return state()
  }
  return {
    state,
    save,
    remove(id: string) {
      const s = read()
      write({ ...s, prompts: s.prompts.filter((p) => p.id !== id) })
      return state()
    },
    catalog: (q: string) => searchPrompts(cat(), q, 60),
    async importCatalog() {
      const r = await fetch(CSV, { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error(`prompts.chat answered ${r.status}`)
      catalog = fromPromptsChat(await r.text())
      writeFileSync(catFile(), JSON.stringify(catalog))
      write({ ...read(), catalogAt: Date.now() })
      return state()
    },
    /** A catalog prompt copied into your library, where you can edit it. */
    adopt(id: string) {
      const p = cat().find((x) => x.id === id)
      if (!p) throw new Error('Not in the catalog.')
      const taken = new Set(read().prompts.map((x) => x.name))
      let name = p.name
      for (let i = 2; taken.has(name); i++) name = `${p.name.slice(0, 36)}-${i}`
      return save({ name, title: p.title, body: p.body, tags: p.tags, source: 'prompts.chat' })
    },
    filtersFor: (persona?: string) => read().filters[persona ?? '*'] ?? read().filters['*'] ?? [],
    setFilters(persona: string, f: Filter[]) {
      const s = read()
      const clean = f.filter((x) => FILTERS[x])
      write({ ...s, filters: { ...s.filters, [persona]: clean } })
      return state()
    },
  }
}
