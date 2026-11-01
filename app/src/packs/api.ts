import type { Packs } from '../../electron/packs'
import type { PackEval } from '../../electron/packseval'

type P = Packs
type E = PackEval
export type Scope = 'project' | 'global'
export type Catalog = ReturnType<P['list']>
export type PackEntry = Catalog['entries'][number]
export type ReviewResult = ReturnType<P['review']>
export type ReviewOk = Extract<ReviewResult, { ok: true }>
export type UpdatePlanResult = ReturnType<P['planUpdate']>
export type UpdateOk = Extract<UpdatePlanResult, { ok: true }>
export type RemovePlan = ReturnType<P['planRemove']>
export type Installed = ReturnType<P['installed']>
export type InstalledPack = Installed['installs'][number]
export type EvalStarted = Awaited<ReturnType<E['start']>>
export type EvalResult = Awaited<ReturnType<E['result']>>

/** The `window.stm.packs` bridge (preload.cjs); every call is a checked ipc channel. */
export type PacksApi = {
  list: () => Promise<Catalog>
  addFolder: (path: string) => Promise<unknown>
  fetchGit: (url: string) => Promise<unknown>
  review: (id: string, version: string, scope: Scope, root: string) => Promise<ReviewResult>
  install: (id: string, version: string, scope: Scope, root: string, decisions: Record<string, 'skip' | 'overwrite'>) => Promise<unknown>
  planUpdate: (id: string, version: string, root: string) => Promise<UpdatePlanResult>
  update: (id: string, version: string, root: string, decisions: Record<string, 'mine' | 'theirs' | 'beside' | 'recreate' | 'leave'>) => Promise<unknown>
  rollback: (id: string, root: string) => Promise<unknown>
  planRemove: (id: string, root: string) => Promise<RemovePlan>
  remove: (id: string, root: string, keepEdited: boolean) => Promise<unknown>
  setMcp: (id: string, root: string, server: string, on: boolean) => Promise<unknown>
  installed: (root: string) => Promise<Installed>
  evalStart: (id: string, root: string, prompt: string, model: string, maxTurns: number) => Promise<EvalStarted>
  evalResult: (evalId: string) => Promise<EvalResult>
  evalDiscard: (evalId: string) => Promise<{ ok: boolean; panels: string[] }>
}
