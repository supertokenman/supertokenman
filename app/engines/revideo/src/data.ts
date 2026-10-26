// The JSON a piece's script fills in. Claude writes this, never animation code: one template, many videos.
export type Brand = { bg: string; surface: string; text: string; muted: string; accent: string; onAccent: string; accent2: string; font: string; display: string; upper: boolean }
export type Point = { title: string; body?: string; value?: string; /** what the voice says on this screen */ say?: string }
export type Data = {
  template: 'explainer' | 'launch' | 'stat' | 'quote'
  brand: Brand
  /** the first second: a promise or a question; *words* in asterisks take the accent */
  hook: string
  kicker?: string
  points: Point[]
  cta: string
  handle?: string
  /** launch only */
  product?: { name: string; tagline: string; say?: string }
  /** stat only: one number that carries the video */
  stat?: { value: string; label: string; source?: string; say?: string }
  /** quote only */
  quote?: { text: string; author: string; role?: string; say?: string }
  /** narration for the hook and the call to action */
  say?: { hook?: string; cta?: string }
  /** filled by the render script from the voice: when each segment starts and how long it lasts */
  timeline?: { key: string; kind: string; index?: number; start: number; dur: number; say?: string; voice?: number; words?: { w: string; s: number; e: number }[] }[]
  /** show the spoken words as captions */
  captions?: boolean
  /** seconds per point; the hook and the call to action have their own */
  pace?: number
}

export const DEFAULT_BRAND: Brand = { bg: '#141413', surface: '#1f1e1b', text: '#f4efe6', muted: '#b0aea5', accent: '#d97757', onAccent: '#141413', accent2: '#9fc48a', font: 'Inter, -apple-system, system-ui, sans-serif', display: 'SuperToken Display', upper: true }

export const SAMPLE: Data = {
  template: 'explainer',
  brand: DEFAULT_BRAND,
  hook: 'Você aquece *errado* antes de correr',
  kicker: 'corrida · 20 segundos',
  points: [
    { title: 'Skipping', body: 'joelho alto, 4 segundos', value: '4 s' },
    { title: 'Chute frontal', body: 'alonga o posterior em movimento', value: '4 s' },
    { title: 'Calcanhar ao glúteo', body: 'acorda o quadríceps', value: '4 s' },
    { title: 'Corrida leve', body: 'solta o corpo e vai', value: '8 s' },
  ],
  cta: 'Salva pra usar amanhã',
  handle: '@bia.e.ze',
}


