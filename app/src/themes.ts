// Themes: one palette drives the CSS variables of the whole app and recolors the SVGs (HUD, compact
// HUD, mascot), which are drawn in the base palette below and mapped color by color.

export type Theme = {
  id: string
  name: string
  scheme: 'dark' | 'light'
  /** bg, surface, raised, hover, text, muted, faint, accent, accentHover, deep, glow, onAccent, green, red */
  c: {
    bg: string
    surface: string
    raised: string
    hover: string
    sunken: string
    text: string
    muted: string
    faint: string
    accent: string
    accentHover: string
    deep: string
    glow: string
    onAccent: string
    green: string
    red: string
    gold: string
    blue: string
  }
}

/** The colors the SVGs are drawn in (Ink, id claude-dark), each mapped to a theme's own. */
const BASE = {
  ink: '#141413',
  panel: '#1f1e1b',
  line: '#3d3c38',
  track: '#2b2a27',
  cream: '#faf9f5',
  gray: '#b0aea5',
  orange: '#d97757',
  deep: '#c15f3c',
  glow: '#f2b49a',
  dark: '#a94f30',
}

export const THEMES: Theme[] = [
  {
    id: 'claude-dark',
    name: 'Ink',
    scheme: 'dark',
    c: { bg: '#0f0f0e', surface: '#161614', raised: '#1e1d1b', hover: '#262522', sunken: '#0b0b0a', text: '#ecebe6', muted: '#8f8d86', faint: '#676560', accent: '#d97757', accentHover: '#e2876a', deep: '#c15f3c', glow: '#f2b49a', onAccent: '#1a0f0a', green: '#9fc48a', red: '#e58a6c', gold: '#c9a26b', blue: '#9fb7d9' },
  },
  {
    id: 'claude-paper',
    name: 'Paper',
    scheme: 'light',
    c: { bg: '#faf9f5', surface: '#f2f0e8', raised: '#e9e6db', hover: '#e1ddd0', sunken: '#ffffff', text: '#1f1e1b', muted: '#6b6962', faint: '#8c8980', accent: '#ba5936', accentHover: '#a94f30', deep: '#a94f30', glow: '#e7a385', onAccent: '#ffffff', green: '#4f7a3a', red: '#b4462a', gold: '#9a7330', blue: '#3f6697' },
  },
  {
    id: 'arcade-neon',
    name: 'Arcade Neon',
    scheme: 'dark',
    c: { bg: '#0b0820', surface: '#130f30', raised: '#1c1742', hover: '#262055', sunken: '#070515', text: '#f2ecff', muted: '#a69ad8', faint: '#6a5fa0', accent: '#ff3d7f', accentHover: '#ff6a9c', deep: '#e0186a', glow: '#ff9cc0', onAccent: '#1a0010', green: '#2de2e6', red: '#ff5a5a', gold: '#ffd23f', blue: '#2de2e6' },
  },
  {
    id: 'game-boy',
    name: 'Game Boy',
    scheme: 'dark',
    c: { bg: '#0f380f', surface: '#1c4a1c', raised: '#265a26', hover: '#306230', sunken: '#0a2a0a', text: '#c4e09a', muted: '#9abc2d', faint: '#76973d', accent: '#9bbc0f', accentHover: '#b4d42a', deep: '#8bac0f', glow: '#d8f07a', onAccent: '#0f380f', green: '#c4e09a', red: '#e0e8a0', gold: '#c4e09a', blue: '#8bac0f' },
  },
  {
    id: 'midnight-ink',
    name: 'Midnight Ink',
    scheme: 'dark',
    c: { bg: '#0b1020', surface: '#111830', raised: '#18223f', hover: '#202c50', sunken: '#070b17', text: '#e4e9f5', muted: '#8a96b8', faint: '#59658d', accent: '#6aa7ff', accentHover: '#8bbcff', deep: '#3f7fe0', glow: '#b8d6ff', onAccent: '#06142e', green: '#7fd4a8', red: '#ff8a7a', gold: '#e8c56f', blue: '#6aa7ff' },
  },
  {
    id: 'sunset-synth',
    name: 'Sunset Synth',
    scheme: 'dark',
    c: { bg: '#1a0b1e', surface: '#24102a', raised: '#311638', hover: '#3e1d47', sunken: '#120716', text: '#ffe9f0', muted: '#c79ab8', faint: '#8a5f80', accent: '#ff8a3d', accentHover: '#ffa463', deep: '#ff4d6d', glow: '#ffd08a', onAccent: '#2a0a10', green: '#7ef0c8', red: '#ff4d6d', gold: '#ffd08a', blue: '#b98aff' },
  },
]

export const SYSTEM = 'system'
/** A theme made in the palette studio, kept on this machine. */
export const CUSTOM = 'custom'
const CUSTOM_KEY = 'stm.customTheme'
export function customTheme(): Theme | null {
  try {
    const t = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null') as Theme | null
    return t && t.c && (t.scheme === 'dark' || t.scheme === 'light') ? { ...t, id: CUSTOM } : null
  } catch {
    return null
  }
}
export function saveCustomTheme(t: Theme) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify({ ...t, id: CUSTOM }))
  } catch {
    // storage off: it applies for this session only
  }
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')

/** The theme for an id, `system` following the OS appearance. */
export function resolve(id: string, prefersDark = true): Theme {
  if (id === SYSTEM) return THEMES[prefersDark ? 0 : 1]!
  if (id === CUSTOM) return customTheme() ?? THEMES[0]!
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!
}

/** The CSS variables of a theme. */
export function cssVars(t: Theme): Record<string, string> {
  const c = t.c
  return {
    '--bg': c.bg,
    '--surface': c.surface,
    '--raised': c.raised,
    '--hover': c.hover,
    '--sunken': c.sunken,
    '--text': c.text,
    '--muted': c.muted,
    '--faint': c.faint,
    '--accent': c.accent,
    '--accent-hover': c.accentHover,
    '--accent-soft': `rgba(${rgb(c.accent)}, 0.12)`,
    '--accent-rgb': rgb(c.accent),
    '--accent-glow': c.glow,
    '--deep': c.deep,
    '--on-accent': c.onAccent,
    '--green': c.green,
    '--red': c.red,
    '--bg-rgb': rgb(c.bg),
    '--surface-rgb': rgb(c.surface),
    '--green-rgb': rgb(c.green),
    '--red-rgb': rgb(c.red),
    '--gold': c.gold,
    '--blue': c.blue,
    '--overlay-rgb': t.scheme === 'light' ? '0, 0, 0' : '255, 255, 255',
    '--border': t.scheme === 'light' ? 'rgba(0, 0, 0, 0.09)' : 'rgba(255, 255, 255, 0.07)',
    '--border-strong': t.scheme === 'light' ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.12)',
    '--shadow': t.scheme === 'light' ? 'rgba(0, 0, 0, 0.18)' : '#000',
  }
}

/** Applies a theme to the document. */
export function apply(t: Theme, root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(cssVars(t))) root.style.setProperty(k, v)
  root.style.colorScheme = t.scheme
  root.dataset.theme = t.id
  root.dataset.scheme = t.scheme
}

/** An SVG drawn in the base palette, recolored for a theme in one pass. */
export function themeSvg(svg: string, t: Theme): string {
  if (t.id === 'claude-dark') return svg
  const c = t.c
  const map: Record<string, string> = {
    [BASE.ink]: t.scheme === 'light' ? c.sunken : c.bg,
    [BASE.panel]: c.raised,
    [BASE.line]: t.scheme === 'light' ? '#cfcabb' : c.hover,
    [BASE.track]: c.hover,
    [BASE.cream]: c.text,
    [BASE.gray]: c.muted,
    [BASE.orange]: c.accent,
    [BASE.deep]: c.deep,
    [BASE.glow]: c.glow,
    [BASE.dark]: c.deep,
  }
  return svg.replace(/#[0-9a-fA-F]{6}\b/g, (h) => map[h.toLowerCase()] ?? h)
}
