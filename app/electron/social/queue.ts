// The publishing queue. Nothing goes out unless the person approved that item; an approved item goes
// out at its time (or right away without one), once per network, and keeps what each network said.
import type { Draft, NetworkId } from './core.js'

export type Result = { ok: boolean; at: number; url?: string; error?: string }
export type Item = Draft & {
  id: string
  networks: NetworkId[]
  /** ms epoch; null: as soon as it is approved */
  when: number | null
  approved: boolean
  createdAt: number
  results: Partial<Record<NetworkId, Result>>
  /** the text for one network when it differs from the main one */
  variants?: Partial<Record<NetworkId, string>>
  /** notes on the draft before it is approved; never posted */
  comments?: { at: number; text: string }[]
}

/** The text that goes to one network: its own version, or the main text. */
export const textFor = (i: Pick<Item, 'text' | 'variants'>, n: NetworkId) => (i.variants?.[n]?.trim() ? i.variants[n]! : i.text)

export function cleanItem(i: Partial<Item>, now = Date.now()): Item {
  const nets = [...new Set((i.networks ?? []).filter((n) => ['instagram', 'facebook', 'threads', 'youtube', 'linkedin', 'x', 'tiktok', 'bluesky', 'mastodon'].includes(n)))] as NetworkId[]
  return {
    id: i.id && /^[a-z0-9]{4,24}$/.test(i.id) ? i.id : `q${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    text: String(i.text ?? '').slice(0, 5000),
    mediaUrl: i.mediaUrl && /^https:\/\//.test(i.mediaUrl) ? i.mediaUrl : undefined,
    mediaKind: i.mediaKind === 'video' ? 'video' : i.mediaUrl ? 'image' : undefined,
    link: i.link && /^https?:\/\//.test(i.link) ? i.link : undefined,
    title: i.title ? String(i.title).slice(0, 200) : undefined,
    networks: nets,
    when: typeof i.when === 'number' ? i.when : null,
    approved: Boolean(i.approved),
    createdAt: i.createdAt ?? now,
    results: i.results ?? {},
    ...(i.variants && Object.keys(i.variants).length ? { variants: Object.fromEntries(Object.entries(i.variants).filter(([n, t]) => nets.includes(n as NetworkId) && typeof t === 'string' && t.trim()).map(([n, t]) => [n, String(t).slice(0, 5000)])) } : {}),
    ...(i.comments?.length ? { comments: i.comments.filter((c) => c && String(c.text).trim()).map((c) => ({ at: Number(c.at) || now, text: String(c.text).slice(0, 2000) })).slice(-50) } : {}),
  }
}

/** The networks still to publish to, when the item is due; [] otherwise. */
export function dueNetworks(i: Item, now: number): NetworkId[] {
  if (!i.approved || (i.when != null && i.when > now)) return []
  // a failure stays until the person retries it, so an error is never repeated on its own
  return i.networks.filter((n) => !i.results[n])
}

export type ItemState = 'draft' | 'scheduled' | 'publishing' | 'done' | 'partly' | 'failed'
export function stateOf(i: Item, now = Date.now()): ItemState {
  const r = i.networks.map((n) => i.results[n])
  if (r.length && r.every((x) => x?.ok)) return 'done'
  if (r.some((x) => x && !x.ok) && !r.some((x) => x?.ok)) return 'failed'
  if (r.some((x) => x?.ok)) return 'partly'
  if (!i.approved) return 'draft'
  return i.when != null && i.when > now ? 'scheduled' : 'publishing'
}

/** What a draft is missing for a network, said plainly; '' when it can go. */
export function problem(i: Item, n: NetworkId): string {
  i = { ...i, text: textFor(i, n) }
  if (!i.text.trim() && n !== 'tiktok' && n !== 'instagram') return 'Needs text.'
  if (n === 'instagram' && !i.mediaUrl) return 'Instagram needs a photo or video link.'
  if (n === 'tiktok' && (!i.mediaUrl || i.mediaKind !== 'video')) return 'TikTok needs a video link.'
  if (n === 'x' && (i.text + (i.link ? ` ${i.link}` : '')).length > 280) return 'Over 280 characters for X.'
  if (n === 'threads' && i.text.length > 500) return 'Over 500 characters for Threads.'
  if (n === 'instagram' && i.text.length > 2200) return 'Over 2,200 characters for Instagram.'
  if (n === 'youtube') return 'Uploading to YouTube is not supported yet.'
  if (n === 'bluesky' && (i.text + (i.link && !i.text.includes(i.link) ? ` ${i.link}` : '')).length > 300) return 'Over 300 characters for Bluesky.'
  if (n === 'mastodon' && (i.text + (i.link ? ` ${i.link}` : '')).length > 500) return 'Over 500 characters for Mastodon.'
  return ''
}
