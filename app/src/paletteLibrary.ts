// The palette studio's library: palettes made for this app, searchable by mood and use, and public
// design systems worth studying (names and links only; open them to read their own docs).

export type NamedPalette = { name: string; colors: string[]; tags: string[] }

export const PALETTES: NamedPalette[] = [
  { name: 'Terracota', colors: ['#2b1d16', '#7a3b22', '#c15f3c', '#e9a07c', '#f6e7d8'], tags: ['warm', 'quente', 'earth', 'terra', 'clay', 'brand'] },
  { name: 'Constructivist', colors: ['#111111', '#c8102e', '#f4efe6', '#d9cbb3', '#1f3a93'], tags: ['poster', 'bold', 'red', 'vermelho', 'art', 'arte'] },
  { name: 'Swiss Grid', colors: ['#ffffff', '#111111', '#e30613', '#9a9a9a', '#f2f2f2'], tags: ['minimal', 'minimalista', 'type', 'clean', 'limpo'] },
  { name: 'Lençóis', colors: ['#f6efe1', '#e4d3b0', '#7fb7c9', '#2f6f8f', '#14323f'], tags: ['beach', 'praia', 'sand', 'areia', 'water', 'agua', 'brasil'] },
  { name: 'Mata Atlântica', colors: ['#0f2a1d', '#1f5134', '#3f8a5a', '#9fcb8d', '#eef5e6'], tags: ['green', 'verde', 'forest', 'floresta', 'nature', 'natureza', 'brasil'] },
  { name: 'Ipê', colors: ['#3d1438', '#8a2c78', '#d65db1', '#ffc75f', '#fff1d0'], tags: ['pink', 'rosa', 'flower', 'flor', 'vibrant', 'vibrante', 'brasil'] },
  { name: 'Cerrado', colors: ['#3b2618', '#8c5a2b', '#d4a24c', '#a7b56d', '#f3ead6'], tags: ['earth', 'terra', 'dry', 'savanna', 'brasil', 'warm'] },
  { name: 'Copacabana', colors: ['#111111', '#f7f3ea', '#e3b23c', '#2f8f83', '#d9534f'], tags: ['beach', 'praia', 'retro', 'rio', 'brasil'] },
  { name: 'Ocean Deep', colors: ['#03045e', '#023e8a', '#0077b6', '#48cae4', '#caf0f8'], tags: ['blue', 'azul', 'ocean', 'oceano', 'calm', 'calmo', 'sea', 'mar'] },
  { name: 'Sunset Synth', colors: ['#1a0b2e', '#4a1a6b', '#c2185b', '#ff6f3c', '#ffc93c'], tags: ['sunset', 'por do sol', 'retro', '80s', 'synthwave', 'neon'] },
  { name: 'Arcade', colors: ['#07060d', '#3ff4ff', '#b6ff3f', '#ff8b3f', '#ff3fa4'], tags: ['game', 'jogo', 'neon', 'arcade', 'retro', '80s'] },
  { name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#e0f8d0'], tags: ['game', 'jogo', 'retro', 'green', 'verde', 'pixel'] },
  { name: 'Midnight Ink', colors: ['#0b1020', '#16213e', '#2f3e6e', '#8fa3d1', '#e6ecff'], tags: ['dark', 'escuro', 'blue', 'azul', 'night', 'noite', 'calm'] },
  { name: 'Paper & Ink', colors: ['#faf9f5', '#e9e6db', '#6b6962', '#1f1e1b', '#c15f3c'], tags: ['light', 'claro', 'editorial', 'reading', 'leitura', 'neutral'] },
  { name: 'Fintech Trust', colors: ['#0a2540', '#163d66', '#3a7bd5', '#00d4b0', '#f6f9fc'], tags: ['finance', 'financas', 'bank', 'banco', 'saas', 'trust', 'confianca', 'b2b'] },
  { name: 'Health Calm', colors: ['#0d3b40', '#1b6f6a', '#5cc2b2', '#c7efe6', '#ffffff'], tags: ['health', 'saude', 'clinic', 'clinica', 'calm', 'calmo', 'teal'] },
  { name: 'Food Market', colors: ['#2d1e12', '#c0392b', '#f39c12', '#27ae60', '#fdf6e3'], tags: ['food', 'comida', 'restaurant', 'restaurante', 'delivery', 'appetite'] },
  { name: 'Kids Play', colors: ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'], tags: ['kids', 'criancas', 'playful', 'divertido', 'education', 'educacao', 'colorful'] },
  { name: 'Luxury Noir', colors: ['#0c0c0c', '#1d1b18', '#3b352c', '#b08d57', '#efe6d2'], tags: ['luxury', 'luxo', 'premium', 'gold', 'dourado', 'dark', 'fashion', 'moda'] },
  { name: 'Nordic Frost', colors: ['#2e3440', '#4c566a', '#88c0d0', '#d8dee9', '#eceff4'], tags: ['cold', 'frio', 'nordic', 'minimal', 'dev', 'code', 'calm'] },
  { name: 'Coffee House', colors: ['#2b1b12', '#5c3d2e', '#a0785a', '#d9b99b', '#f5ebe0'], tags: ['coffee', 'cafe', 'warm', 'quente', 'cozy', 'brown', 'marrom'] },
  { name: 'Citrus', colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'], tags: ['fresh', 'fresco', 'summer', 'verao', 'friendly', 'startup'] },
  { name: 'Running Track', colors: ['#14213d', '#fca311', '#e5e5e5', '#ffffff', '#d62828'], tags: ['sport', 'esporte', 'running', 'corrida', 'energy', 'energia', 'fitness'] },
  { name: 'Lavender Fields', colors: ['#2d2a4a', '#5b4b8a', '#a78bfa', '#ddd6fe', '#f5f3ff'], tags: ['purple', 'roxo', 'lilac', 'lilas', 'soft', 'suave', 'beauty', 'beleza'] },
  { name: 'Brutalist', colors: ['#000000', '#ffffff', '#ffde00', '#ff3b30', '#0047ff'], tags: ['bold', 'brutal', 'brutalist', 'loud', 'web', 'poster'] },
  { name: 'Desert Rose', colors: ['#4a2c2a', '#9e5a4b', '#d9a497', '#f2d0c4', '#fbf1ec'], tags: ['rose', 'rosa', 'soft', 'suave', 'wedding', 'casamento', 'warm'] },
  { name: 'Terminal', colors: ['#0c0c0c', '#1e1e1e', '#39ff14', '#ffb000', '#d4d4d4'], tags: ['dev', 'code', 'codigo', 'terminal', 'hacker', 'dark', 'escuro'] },
  { name: 'Forest Night', colors: ['#0b1d14', '#173d2a', '#2e6b4a', '#c9a227', '#efe9d8'], tags: ['green', 'verde', 'gold', 'dark', 'outdoor', 'camping'] },
  { name: 'Coral Reef', colors: ['#003049', '#0081a7', '#00afb9', '#fdfcdc', '#f07167'], tags: ['ocean', 'oceano', 'coral', 'tropical', 'travel', 'viagem'] },
  { name: 'Grayscale Pro', colors: ['#111827', '#374151', '#6b7280', '#d1d5db', '#f9fafb'], tags: ['neutral', 'neutro', 'gray', 'cinza', 'dashboard', 'saas', 'b2b'] },
]

export type DesignSystem = { name: string; by: string; url: string; what: string; tags: string[] }

export const DESIGN_SYSTEMS: DesignSystem[] = [
  { name: 'Material Design 3', by: 'Google', url: 'https://m3.material.io/', what: 'Dynamic color from one seed, tokens, components for Android and web.', tags: ['android', 'tokens', 'color', 'components', 'motion'] },
  { name: 'Human Interface Guidelines', by: 'Apple', url: 'https://developer.apple.com/design/human-interface-guidelines', what: 'How apps should look and behave on Apple platforms.', tags: ['ios', 'macos', 'apple', 'guidelines', 'accessibility'] },
  { name: 'Fluent 2', by: 'Microsoft', url: 'https://fluent2.microsoft.design/', what: 'Windows and Microsoft 365: tokens, components, motion.', tags: ['windows', 'tokens', 'components', 'enterprise'] },
  { name: 'Carbon', by: 'IBM', url: 'https://carbondesignsystem.com/', what: 'Data-heavy enterprise UI, strong on tables and charts.', tags: ['enterprise', 'data', 'dashboard', 'charts', 'react'] },
  { name: 'Primer', by: 'GitHub', url: 'https://primer.style/', what: 'Developer tools UI, themes and accessible color.', tags: ['dev', 'developer', 'themes', 'react', 'accessibility'] },
  { name: 'Polaris', by: 'Shopify', url: 'https://polaris.shopify.com/', what: 'Admin and commerce, with strong content guidelines.', tags: ['commerce', 'ecommerce', 'admin', 'writing', 'react'] },
  { name: 'Atlassian Design System', by: 'Atlassian', url: 'https://atlassian.design/', what: 'Collaboration tools: tokens, components, content.', tags: ['saas', 'b2b', 'tokens', 'react'] },
  { name: 'Lightning Design System', by: 'Salesforce', url: 'https://www.lightningdesignsystem.com/', what: 'CRM-scale enterprise components and blueprints.', tags: ['enterprise', 'crm', 'b2b', 'components'] },
  { name: 'Spectrum', by: 'Adobe', url: 'https://spectrum.adobe.com/', what: 'Creative tools UI, accessible color system.', tags: ['creative', 'color', 'accessibility', 'components'] },
  { name: 'Base', by: 'Uber', url: 'https://base.uber.com/', what: 'Mobility and maps products, clear hierarchy.', tags: ['mobile', 'maps', 'components'] },
  { name: 'GOV.UK Design System', by: 'UK Government', url: 'https://design-system.service.gov.uk/', what: 'Forms and services that everyone must be able to use.', tags: ['forms', 'accessibility', 'government', 'public', 'writing'] },
  { name: 'Radix Themes', by: 'WorkOS', url: 'https://www.radix-ui.com/themes', what: 'Accessible React primitives and a 12-step color scale.', tags: ['react', 'color', 'accessibility', 'open source'] },
  { name: 'shadcn/ui', by: 'open source', url: 'https://ui.shadcn.com/', what: 'Copy-in React components on Radix and Tailwind; themeable with CSS variables.', tags: ['react', 'tailwind', 'open source', 'components', 'themes'] },
  { name: 'Ant Design', by: 'Ant Group', url: 'https://ant.design/', what: 'Large component set for admin and data apps.', tags: ['react', 'admin', 'dashboard', 'enterprise'] },
  { name: 'Chakra UI', by: 'open source', url: 'https://www.chakra-ui.com/', what: 'Accessible React components with style props and tokens.', tags: ['react', 'tokens', 'open source', 'accessibility'] },
  { name: 'Open Props', by: 'open source', url: 'https://open-props.style/', what: 'CSS custom properties: colors, sizes, easings, ready to use.', tags: ['css', 'tokens', 'open source', 'color', 'motion'] },
  { name: 'Design Tokens format', by: 'W3C Community Group', url: 'https://www.designtokens.org/', what: 'The shared JSON format for tokens between design and code.', tags: ['tokens', 'standard', 'json'] },
  { name: 'WCAG contrast', by: 'W3C', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html', what: 'The contrast rules every palette here is checked against.', tags: ['accessibility', 'contrast', 'color', 'standard'] },
  { name: 'Gestão de Design Gov.br', by: 'Governo Federal', url: 'https://www.gov.br/ds/', what: 'O design system dos serviços públicos brasileiros.', tags: ['brasil', 'governo', 'forms', 'accessibility', 'public'] },
]

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** Everything whose name, tags or description has every word of the query. */
export function search<T extends { name: string; tags: string[] }>(items: T[], q: string, more: (t: T) => string = () => ''): T[] {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return items
  return items.filter((t) => {
    const hay = norm(`${t.name} ${t.tags.join(' ')} ${more(t)}`)
    return words.every((w) => hay.includes(w))
  })
}
