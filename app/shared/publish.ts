// Posting without paid APIs: each network's own "share" page, opened in the account the user is already
// signed in to, with the text filled in. The user presses Post there; nothing is sent on their behalf.

export type Network = { id: string; name: string; limit: number; app?: string; intent: (text: string, link?: string) => string }

const q = encodeURIComponent

export const NETWORKS: Network[] = [
  { id: 'linkedin', name: 'LinkedIn', limit: 3000, app: 'linkedin', intent: (t, l) => `https://www.linkedin.com/feed/?shareActive=true&text=${q(l ? `${t}\n\n${l}` : t)}` },
  { id: 'x', name: 'X', limit: 280, app: 'x', intent: (t, l) => `https://x.com/intent/post?text=${q(t)}${l ? `&url=${q(l)}` : ''}` },
  { id: 'threads', name: 'Threads', limit: 500, intent: (t, l) => `https://www.threads.net/intent/post?text=${q(l ? `${t} ${l}` : t)}` },
  { id: 'bluesky', name: 'Bluesky', limit: 300, intent: (t, l) => `https://bsky.app/intent/compose?text=${q(l ? `${t} ${l}` : t)}` },
  { id: 'reddit', name: 'Reddit', limit: 40000, app: 'reddit', intent: (t, l) => `https://www.reddit.com/submit?${l ? `url=${q(l)}&` : 'type=TEXT&'}title=${q(t.split('\n')[0]!.slice(0, 300))}${l ? '' : `&text=${q(t.split('\n').slice(1).join('\n').trim())}`}` },
  { id: 'facebook', name: 'Facebook', limit: 63206, intent: (t, l) => `https://www.facebook.com/sharer/sharer.php?u=${q(l ?? '')}&quote=${q(t)}` },
]

/** Characters as a network counts them: X counts any link as 23. */
export function lengthOn(n: Network, text: string, link?: string): number {
  if (n.id === 'x') return [...text.replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length + (link ? 24 : 0)
  return [...text].length + (link ? link.length + 2 : 0)
}
