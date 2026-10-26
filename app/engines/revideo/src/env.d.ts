declare module '*?url' {
  const url: string
  export default url
}
declare module '../timeline.js' {
  export type Segment = { key: string; kind: 'hook' | 'product' | 'stat' | 'quote' | 'point' | 'cta'; index?: number; start: number; dur: number; say?: string; voice?: number }
  export function timeline(d: unknown, voice?: Record<string, number>): Segment[]
  export function total(tl: { dur: number }[]): number
  export function wordTimes(seg: Segment): { word: string; start: number; end: number }[]
  export const LEAD: number
}
