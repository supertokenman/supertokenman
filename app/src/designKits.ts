// Design kits: starting points for a new product's interface. Each kit is a set of decisions (color,
// corners, type, borders, shadows, density) the preview draws live and the panel can build into a
// project in its own stack. Fonts are system stacks, so nothing is downloaded.

export type Kit = {
  id: string
  name: string
  mood: string
  /** what it suits, for the search and for Claude */
  for: string[]
  t: {
    bg: string
    surface: string
    text: string
    muted: string
    border: string
    accent: string
    onAccent: string
    accent2: string
    radius: number
    font: string
    heading: string
    /** heading weight and letter case */
    weight: number
    upper: boolean
    borderWidth: number
    shadow: string
    /** base spacing in px */
    space: number
  }
  rules: string[]
}

export const KITS: Kit[] = [
  {
    id: 'soft-saas',
    name: 'Soft SaaS',
    mood: 'Friendly and calm: rounded, airy, one confident color.',
    for: ['saas', 'b2b', 'startup', 'dashboard', 'onboarding'],
    t: { bg: '#f7f8fb', surface: '#ffffff', text: '#161a23', muted: '#5d6475', border: '#e4e7ee', accent: '#4f5bd5', onAccent: '#ffffff', accent2: '#16a37a', radius: 14, font: "system-ui, -apple-system, 'Segoe UI', sans-serif", heading: "system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 700, upper: false, borderWidth: 1, shadow: '0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.06)', space: 16 },
    rules: ['One accent for actions; everything else neutral.', 'Generous padding; cards float on a tinted page.', 'Rounded 12 to 16 px everywhere, pills for tags.'],
  },
  {
    id: 'swiss',
    name: 'Swiss Grid',
    mood: 'Strict grid, big type, red only where it matters.',
    for: ['portfolio', 'agency', 'editorial', 'landing', 'minimal'],
    t: { bg: '#ffffff', surface: '#ffffff', text: '#111111', muted: '#6b6b6b', border: '#111111', accent: '#e30613', onAccent: '#ffffff', accent2: '#111111', radius: 0, font: "'Helvetica Neue', Helvetica, Arial, sans-serif", heading: "'Helvetica Neue', Helvetica, Arial, sans-serif", weight: 700, upper: false, borderWidth: 1, shadow: 'none', space: 16 },
    rules: ['No shadows, no rounding: hierarchy comes from size and the grid.', 'Black rules separate sections.', 'Red is reserved for the single most important action.'],
  },
  {
    id: 'constructivist',
    name: 'Constructivist',
    mood: 'The app’s own language: cut corners, diagonals, poster energy.',
    for: ['dev tools', 'gaming', 'creative', 'bold', 'brand'],
    t: { bg: '#f4efe6', surface: '#fbf8f2', text: '#1d1b18', muted: '#6b665d', border: '#1d1b18', accent: '#c8102e', onAccent: '#ffffff', accent2: '#1f3a93', radius: 0, font: "system-ui, -apple-system, sans-serif", heading: "'SuperToken Display', 'Arial Black', sans-serif", weight: 400, upper: true, borderWidth: 2, shadow: '4px 4px 0 #1d1b18', space: 14 },
    rules: ['Corners cut at 45 degrees on primary elements.', 'Hard offset shadows instead of blur.', 'Display face for headings, system face for reading.'],
  },
  {
    id: 'fintech',
    name: 'Fintech Trust',
    mood: 'Serious and precise: deep navy, numbers first.',
    for: ['finance', 'bank', 'payments', 'b2b', 'data'],
    t: { bg: '#f6f9fc', surface: '#ffffff', text: '#0a2540', muted: '#425466', border: '#e3e8ee', accent: '#0a2540', onAccent: '#ffffff', accent2: '#00b386', radius: 8, font: "system-ui, -apple-system, 'Segoe UI', sans-serif", heading: "system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 650, upper: false, borderWidth: 1, shadow: '0 2px 5px rgba(50,50,93,.08), 0 1px 1px rgba(0,0,0,.04)', space: 16 },
    rules: ['Tabular numbers; amounts right-aligned.', 'Green only for money in, never decoration.', 'Quiet borders, small radius, dense tables.'],
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    mood: 'Loud, raw and honest: thick borders, flat color, no polish.',
    for: ['indie', 'creative', 'landing', 'community', 'bold'],
    t: { bg: '#fffdf2', surface: '#ffffff', text: '#000000', muted: '#333333', border: '#000000', accent: '#ffde00', onAccent: '#000000', accent2: '#ff3b30', radius: 0, font: "ui-monospace, 'SF Mono', Menlo, monospace", heading: "'Arial Black', 'Helvetica Neue', sans-serif", weight: 900, upper: true, borderWidth: 3, shadow: '6px 6px 0 #000000', space: 14 },
    rules: ['3 px black borders on everything interactive.', 'Flat fills; color blocks instead of gradients.', 'Mono for body text.'],
  },
  {
    id: 'glass-dark',
    name: 'Night Glass',
    mood: 'Dark, layered, a little glow: for tools used all day.',
    for: ['dev tools', 'ai', 'dashboard', 'dark', 'analytics'],
    t: { bg: '#0b0d12', surface: '#151821', text: '#e8eaf0', muted: '#9097a8', border: '#262b38', accent: '#6d4cf6', onAccent: '#ffffff', accent2: '#2bd9c4', radius: 12, font: "system-ui, -apple-system, 'Segoe UI', sans-serif", heading: "system-ui, -apple-system, 'Segoe UI', sans-serif", weight: 650, upper: false, borderWidth: 1, shadow: '0 0 0 1px rgba(124,92,255,.15), 0 12px 32px rgba(0,0,0,.45)', space: 16 },
    rules: ['Surfaces step up in lightness, never pure black on black.', 'Glow only on focus and the primary action.', 'Muted text at 4.5:1 at least.'],
  },
  {
    id: 'editorial',
    name: 'Editorial',
    mood: 'Reading first: serif headlines, paper tones, wide margins.',
    for: ['blog', 'newsletter', 'content', 'docs', 'media'],
    t: { bg: '#faf7f0', surface: '#ffffff', text: '#1f1c17', muted: '#6e675c', border: '#e6dfd1', accent: '#8a3b2a', onAccent: '#ffffff', accent2: '#2f5d50', radius: 4, font: "Georgia, 'Times New Roman', serif", heading: "Georgia, 'Times New Roman', serif", weight: 700, upper: false, borderWidth: 1, shadow: 'none', space: 18 },
    rules: ['Line length 60 to 75 characters.', 'Serif for headlines and body; sans only for labels.', 'Color is ink-like and rare.'],
  },
  {
    id: 'playful',
    name: 'Playful',
    mood: 'Bright and bouncy: big radius, several colors, friendly copy.',
    for: ['kids', 'education', 'consumer', 'community', 'games'],
    t: { bg: '#fff8ef', surface: '#ffffff', text: '#2b2140', muted: '#6b6280', border: '#f0e3d0', accent: '#d6363c', onAccent: '#ffffff', accent2: '#1982c4', radius: 22, font: "'Avenir Next Rounded', 'Avenir Next', system-ui, sans-serif", heading: "'Avenir Next Rounded', 'Avenir Next', system-ui, sans-serif", weight: 800, upper: false, borderWidth: 2, shadow: '0 6px 0 rgba(43,33,64,.12)', space: 16 },
    rules: ['Radius 20 px and up; buttons feel pressable (bottom shadow).', 'Up to four colors, each with one meaning.', 'Short, warm microcopy.'],
  },
]

/** The kit as CSS custom properties, to paste or to build on. */
export function kitCss(k: Kit): string {
  const t = k.t
  return `:root {
  --bg: ${t.bg};
  --surface: ${t.surface};
  --text: ${t.text};
  --muted: ${t.muted};
  --border: ${t.border};
  --accent: ${t.accent};
  --on-accent: ${t.onAccent};
  --accent-2: ${t.accent2};
  --radius: ${t.radius}px;
  --border-width: ${t.borderWidth}px;
  --shadow: ${t.shadow};
  --space: ${t.space}px;
  --font: ${t.font};
  --font-heading: ${t.heading};
  --heading-weight: ${t.weight};
  --heading-case: ${t.upper ? 'uppercase' : 'none'};
}`
}

/** What the panel is asked to do with a kit: set it up in this project's own stack. */
export function kitPrompt(k: Kit, accent?: string): string {
  const css = kitCss(accent ? { ...k, t: { ...k.t, accent } } : k)
  return [
    `Set up the "${k.name}" design kit in this project. ${k.mood}`,
    '',
    'Tokens:',
    '```css',
    css,
    '```',
    '',
    'Rules of the kit:',
    ...k.rules.map((r) => `- ${r}`),
    '',
    'Do this in the stack the project already uses (look before you write: Tailwind config, CSS modules, a component library, plain CSS):',
    '1. Add the tokens in the project’s way (CSS variables, a Tailwind theme extension, or a theme object).',
    '2. Create the base components if they are missing: Button (primary, secondary, ghost), Input with label and error, Card, Badge, Navbar, Modal, Toast, Table, and a Pricing section with three tiers. Reuse what exists instead of duplicating it.',
    '3. Check contrast: text 4.5:1 at least, large text and UI 3:1.',
    '4. Show me the list of files you changed and how to preview the components. Ask before adding dependencies.',
  ].join('\n')
}

export function searchKits(q: string): Kit[] {
  const ws = q.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean)
  if (!ws.length) return KITS
  return KITS.filter((k) => {
    const hay = `${k.name} ${k.mood} ${k.for.join(' ')}`.toLowerCase()
    return ws.every((w) => hay.includes(w))
  })
}
