// Uninstall plan for a pack (spec section 7, "Remove plan"). Pure: main passes what is on disk (the
// hash of each file state lists, the CLAUDE.md text, the children of the pack's folders) and gets back
// what to delete, what to keep and what to ask. Only paths recorded in state are ever listed.

import type { Hash } from './packmerge.js'

/** A file state records for this pack: its path under the root and the hash of the bytes we wrote. */
export type RemoveFile = { to: string; sha256: string }

export type RemoveInput = {
  packId: string
  files: RemoveFile[]
  /** hash of the rules block as written; null or absent when the pack wrote no rules */
  rulesSha256?: Hash
  /** current hash of each state file: null when missing on disk */
  disk: Record<string, Hash>
  /** current CLAUDE.md text, null when there is no file */
  claudeMd: string | null
  /** directory (relative to root) -> child paths on disk; directories not listed are left alone */
  dirs: Record<string, string[]>
}

/** keepEdited: leave files the user changed (and their rules block) in place; the default. */
export type RemoveOpts = { keepEdited: boolean }

export type RemovePlan = {
  /** files to delete */
  delete: string[]
  /** files not deleted, with why; `outside` is a state entry that is not a pack target */
  kept: { to: string; reason: 'edited' | 'missing' | 'outside' }[]
  /** the rules block: `remove` drops it, `keep` leaves it, `none` means no block of ours was found */
  rules: { action: 'remove' | 'keep' | 'none'; edited: boolean; text: string | null }
  /** pack folders that end up empty, deepest first */
  dirs: string[]
}

const inside = (id: string, to: string) =>
  !to.split('/').includes('..') && (to.startsWith(`.claude/skills/${id}/`) || to.startsWith(`.claude/packs/${id}/`))

/** The folders a pack may own: `.claude/skills/<id>` and `.claude/packs/<id>`, and everything below them. */
const packRoots = (id: string) => [`.claude/skills/${id}`, `.claude/packs/${id}`]

/** Every folder between a file and its pack root, the root included. */
function ancestors(id: string, to: string): string[] {
  const out: string[] = []
  const parts = to.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    const dir = parts.slice(0, i).join('/')
    if (packRoots(id).includes(dir) || packRoots(id).some(r => dir.startsWith(r + '/'))) out.push(dir)
  }
  return out
}

/** Removes the marker block and returns the text without it; `body` is the lines between the markers. */
function findBlock(id: string, text: string): { body: string; text: string } | null {
  const lines = text.split('\n')
  const start = lines.findIndex(l => new RegExp(`^<!-- stm-pack:${id} v\\S+ start -->$`).test(l))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && l === `<!-- stm-pack:${id} end -->`)
  if (end < 0) return null
  return {
    body: lines.slice(start + 1, end).join('\n'),
    text: [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n'),
  }
}

/** The uninstall plan. `hash` hashes a block body the same way install did (injected, so this stays pure). */
export function planRemove(input: RemoveInput, opts: RemoveOpts, hash: (s: string) => string): RemovePlan {
  const { packId: id } = input
  const del: string[] = []
  const kept: RemovePlan['kept'] = []

  for (const f of input.files) {
    if (!inside(id, f.to)) { kept.push({ to: f.to, reason: 'outside' }); continue }
    const now = input.disk[f.to] ?? null
    if (now === null) { kept.push({ to: f.to, reason: 'missing' }); continue }
    if (now === f.sha256) { del.push(f.to); continue }
    if (opts.keepEdited) kept.push({ to: f.to, reason: 'edited' })
    else del.push(f.to)
  }

  // rules block: only when state says the pack wrote one; a missing marker means the user removed it
  let rules: RemovePlan['rules'] = { action: 'none', edited: false, text: input.claudeMd }
  const block = input.rulesSha256 != null && input.claudeMd !== null ? findBlock(id, input.claudeMd) : null
  if (block) {
    const edited = hash(block.body) !== input.rulesSha256
    const action = edited && opts.keepEdited ? 'keep' : 'remove'
    rules = { action, edited, text: action === 'remove' ? block.text : input.claudeMd }
  }

  // empty folders: a folder goes when every child on disk is being removed (files, or folders above it)
  const gone = new Set(del)
  const folders = new Set<string>()
  for (const f of input.files) if (inside(id, f.to)) for (const d of ancestors(id, f.to)) folders.add(d)
  for (const r of packRoots(id)) folders.add(r)
  const dirs: string[] = []
  const deepFirst = [...folders].sort((a, b) => b.split('/').length - a.split('/').length)
  for (const d of deepFirst) {
    const children = input.dirs[d]
    if (!children || !children.every(c => gone.has(c))) continue
    dirs.push(d)
    gone.add(d)
  }

  return { delete: del, kept, rules, dirs }
}
