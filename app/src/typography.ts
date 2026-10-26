// How chat messages read: font, size, spacing and colors, as CSS variables over the theme.

export type Typo = { font: string; size: number; line: number; claudeColor: string; youColor: string; youBubble: string; code: string }

export const FONTS: Record<string, { name: string; css: string }> = {
  system: { name: 'System', css: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif" },
  rounded: { name: 'Rounded', css: "ui-rounded, 'SF Pro Rounded', -apple-system, sans-serif" },
  serif: { name: 'Serif', css: "ui-serif, 'New York', Georgia, serif" },
  mono: { name: 'Mono', css: "ui-monospace, 'SF Mono', Menlo, monospace" },
}

/** Colors are theme roles ("text", "muted", "accent"...) or a hex the user picked. */
export const DEFAULT_TYPO: Typo = { font: 'system', size: 13.5, line: 1.65, claudeColor: 'text', youColor: 'text', youBubble: 'raised', code: 'mono' }

export const ROLES = ['text', 'muted', 'accent', 'accent-glow', 'green', 'blue', 'gold', 'raised', 'surface', 'hover', 'accent-soft', 'sunken'] as const
const role = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : `var(--${(ROLES as readonly string[]).includes(v) ? v : fallback})`)

/** The CSS variables for a setting, with anything out of range clamped back. */
export function typoVars(t: Partial<Typo>): Record<string, string> {
  const v = { ...DEFAULT_TYPO, ...t }
  const size = Math.min(20, Math.max(11, Number(v.size) || DEFAULT_TYPO.size))
  const line = Math.min(2.2, Math.max(1.2, Number(v.line) || DEFAULT_TYPO.line))
  return {
    '--msg-font': (FONTS[v.font] ?? FONTS.system!).css,
    '--msg-size': `${size}px`,
    '--msg-line': String(line),
    '--msg-claude': role(v.claudeColor, 'text'),
    '--msg-you': role(v.youColor, 'text'),
    '--msg-you-bg': role(v.youBubble, 'raised'),
    '--msg-code': (FONTS[v.code] ?? FONTS.mono!).css,
  }
}

export function applyTypo(t: Partial<Typo>, root: HTMLElement = document.documentElement) {
  for (const [k, val] of Object.entries(typoVars(t))) root.style.setProperty(k, val)
}
