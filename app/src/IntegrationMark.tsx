// The app's own mark for each integration. Not the service's logo (brand rules forbid redrawing
// those): a pictogram of what the service is, drawn in the app's line (straight strokes, 45 degree
// cuts, square ends) on the cut-corner tile, in a color that recalls the service. Unknown ids get a
// neutral tile with a plug.

const MARKS: Record<string, [string, string]> = {
  supabase: ['Su', '#3ecf8e'],
  neon: ['Ne', '#00c48c'],
  cloudflare: ['Cf', '#f38020'],
  'cloudflare-docs': ['CD', '#f6a35c'],
  github: ['GH', '#2b3137'],
  context7: ['C7', '#5b5bd6'],
  playwright: ['Pw', '#2ead33'],
  stripe: ['St', '#635bff'],
  sentry: ['Se', '#4f3f8f'],
  rea: ['RE', '#3a3f4b'],
  'ai-memory': ['AM', '#8a4b2a'],
  resend: ['Rs', '#1f1f1f'],
  mercadopago: ['MP', '#1f6fd1'],
  paypal: ['PP', '#253b80'],
  asaas: ['As', '#0a4ea3'],
  abacatepay: ['Ab', '#4f8a2b'],
  apify: ['Ap', '#246dff'],
  highlevel: ['HL', '#2b6be0'],
  'chrome-devtools': ['DT', '#3c6fd6'],
  serena: ['Sr', '#2f7a6b'],
  markitdown: ['Md', '#5a4fb0'],
  vercel: ['Ve', '#171717'],
  netlify: ['Nf', '#00ad9f'],
  railway: ['Rw', '#7c5cff'],
  prisma: ['Pr', '#2d3748'],
  linear: ['Li', '#5e6ad2'],
  notion: ['No', '#37352f'],
  atlassian: ['Ji', '#0c66e4'],
  asana: ['As', '#f06a6a'],
  monday: ['Mo', '#ff3d57'],
  clickup: ['Cu', '#7b68ee'],
  airtable: ['At', '#e8a600'],
  posthog: ['Ph', '#f54e00'],
  figma: ['Fi', '#a259ff'],
  canva: ['Ca', '#00b5bd'],
  miro: ['Mi', '#e6b800'],
  huggingface: ['HF', '#f2b600'],
  'aws-knowledge': ['AW', '#ff9900'],
  aws: ['AW', '#ff9900'],
  gcp: ['GC', '#4285f4'],
  azure: ['Az', '#0078d4'],
  'ms-learn': ['ML', '#0078d4'],
  deepwiki: ['DW', '#4b5563'],
  gmail: ['Gm', '#ea4335'],
  outlook: ['Ol', '#0a64ad'],
  instagram: ['Ig', '#c13584'],
  facebook: ['Fb', '#1877f2'],
  threads: ['Th', '#1c1c1c'],
  youtube: ['Yt', '#e00000'],
  linkedin: ['In', '#0a66c2'],
  x: ['X', '#141414'],
  tiktok: ['Tk', '#161823'],
  bluesky: ['Bs', '#1478e8'],
  firecrawl: ['Fc', '#e8541c'],
  'web-reader': ['Wr', '#2f7d6d'],
  n8n: ['n8', '#d3365f'],
  activepieces: ['Ap', '#6e41e2'],
  'activepieces-self': ['Ap', '#6e41e2'],
  mastodon: ['Md', '#5b4fd6'],
  'google-drive': ['Dr', '#1fa463'],
}


/** Pictograms on a 24 x 24 grid, stroked in the tile's ink. */
const P = (d: string) => `<path d="${d}"/>`
const GLYPH: Record<string, string> = {
  // code
  github: P('M7 4v16M7 9h6l4 4v3') + '<rect x="15" y="16" width="4" height="4"/><rect x="5" y="2" width="4" height="4"/>',
  playwright: '<rect x="3" y="5" width="18" height="14"/>' + P('M3 9h18M11 12l6 3-3 1-1 3z'),
  sentry: P('M12 4L21 19H3z') + P('M12 9v5M12 16v1.5'),
  // a window with an inspector cursor over it
  'chrome-devtools': '<rect x="3" y="4" width="18" height="13"/>' + P('M3 8h18M13 12l6 2.5-2.6 1-1 2.6z'),
  // a tree of symbols: one node branching to three
  serena: '<rect x="3" y="10" width="5" height="4"/><rect x="15" y="3" width="6" height="4"/><rect x="15" y="10" width="6" height="4"/><rect x="15" y="17" width="6" height="4"/>' + P('M8 12h3M11 5v14M11 5h4M11 12h4M11 19h4'),
  // a page turning into a heading mark
  markitdown: P('M5 3h9l4 4v14H5z') + P('M8 12v5M8 12l2 2.5 2-2.5v5M15 13v4M13.5 15.5 15 17l1.5-1.5'),
  // a notebook with a bookmark: what the agent remembers
  'ai-memory': '<rect x="5" y="3" width="13" height="18"/>' + P('M5 3v18M14 3v6l2-1.5L18 9V3M8.5 12h6M8.5 15h4'),
  // an envelope with a fast line: mail through an API
  resend: '<rect x="5" y="6" width="16" height="12"/>' + P('M5 6l8 7 8-7M1 10h3M2 14h2'),
  // a card and a bolt: payments
  mercadopago: '<rect x="2" y="5" width="20" height="14"/>' + P('M2 9h20M13 12l-2 3h3l-2 3'),
  paypal: '<rect x="2" y="5" width="20" height="14"/>' + P('M2 9h20M6 14h5'),
  asaas: '<rect x="2" y="5" width="20" height="14"/>' + P('M2 9h20M15 13h4v3h-4z'),
  // a spider on its thread: a robot that collects the web
  apify: P('M12 2v6') + '<circle cx="12" cy="12" r="4"/>' + P('M8 10 4 7M16 10l4-3M8 14l-4 3M16 14l4 3M9 17l-2 4M15 17l2 4'),
  // a funnel: contacts going down to deals
  highlevel: P('M3 4h18l-7 8v7l-4 2v-9z'),
  // the Pix-like diamond of instant payments
  abacatepay: P('M12 3l9 9-9 9-9-9z') + P('M12 8l4 4-4 4-4-4z'),
  // a box taken apart: the lid lifted off its layers
  rea: '<rect x="4" y="13" width="16" height="7"/>' + P('M4 16.5h16M6 9l12-3M9 8.2V4M15 6.6V3'),
  context7: P('M4 5h7v14H4zM13 5h7v14h-7z') + P('M6.5 9h2M6.5 12h2M15.5 9h2M15.5 12h2'),
  // cloud and data
  supabase: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/>' + P('M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5'),
  neon: '<ellipse cx="10" cy="6" rx="6" ry="2.2"/>' + P('M4 6v11c0 1.2 2.7 2.2 6 2.2M16 6v4') + P('M17 12l-3 5h4l-3 5'),
  prisma: P('M12 3L20 18L12 21L4 15z') + P('M12 3v18'),
  cloudflare: P('M6 18h13a3.5 3.5 0 0 0 0-7h-.6A6 6 0 0 0 7 9.5 4.3 4.3 0 0 0 6 18z'),
  'cloudflare-docs': P('M6 15h12a3 3 0 0 0 0-6h-.5A5 5 0 0 0 7.5 8 3.6 3.6 0 0 0 6 15z') + P('M8 19h8M8 21.5h5'),
  vercel: P('M12 20V6M6 12l6-6 6 6') + P('M4 21h16'),
  netlify: '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="10" cy="18" r="2"/>' + P('M7.8 7.4l8.4 1.2M16.6 10.5l-5.2 6M8.8 16.3L6.6 8.9'),
  railway: P('M8 3v18M16 3v18M8 7h8M8 12h8M8 17h8'),
  // work
  linear: P('M4 6h3v3H4zM4 15h3v3H4z') + P('M10 7.5h10M10 16.5h10') + P('M4.8 7.6l.9.9 1.6-1.8'),
  notion: P('M6 3h9l4 4v14H6z') + P('M15 3v4h4M9 11h7M9 14.5h7M9 18h4'),
  atlassian: P('M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z') + P('M14 7v10'),
  asana: P('M4 6l2 2 3-3M4 12l2 2 3-3M4 18l2 2 3-3M12 7h8M12 13h8M12 19h8'),
  monday: P('M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z'),
  clickup: P('M4 4h12v12H4z') + P('M7 10l2 2 4-4') + P('M14 14l6 3-2.5 1-1 2.5z'),
  airtable: P('M3 5h18v14H3zM3 10h18M3 14.5h18M9 5v14'),
  gmail: P('M3 6h18v12H3z') + P('M3 6l9 7 9-7'),
  outlook: P('M3 9l9-5 9 5v10H3z') + P('M3 9l9 6 9-6') + P('M8 19v-4h8v4'),
  'google-drive': P('M3 7h7l2 2h9v10H3z') + P('M3 11h18'),
  // docs
  huggingface: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/><circle cx="12" cy="13" r="2"/>' + P('M12 7v4M10.4 14.2l-3.8 1.6M13.6 14.2l3.8 1.6'),
  // the cloud accounts: what they hold (racks, a node mesh, stacked slabs), read through a lens
  aws: P('M6 16h12a3.5 3.5 0 0 0 0-7h-.5A5.5 5.5 0 0 0 7 8.5 4 4 0 0 0 6 16z') + P('M9 19.5h6M10.5 12.5h3'),
  gcp: P('M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z') + P('M12 8.5l3 1.75v3.5L12 15.5l-3-1.75v-3.5z'),
  azure: P('M5 19L11 5h4L9 19z') + P('M13 19l3-7h3.5l-3 7z'),
  'aws-knowledge': P('M4 4h16v5H4zM4 10.5h16v5H4zM4 17h16v3H4z') + P('M7 6.5h2M7 13h2'),
  'ms-learn': P('M12 5L22 10L12 15L2 10z') + P('M6 12v5c3 2.5 9 2.5 12 0v-5M22 10v6'),
  deepwiki: P('M4 4h9v15H4z') + '<circle cx="16" cy="15" r="4"/>' + P('M19 18l3 3M6.5 8h4M6.5 11h2'),
  // design
  figma: P('M12 3l6 7-6 11-6-11z') + '<circle cx="12" cy="11" r="1.6"/>' + P('M12 3v6.4'),
  canva: P('M3 5h18v14H3z') + P('M3 16l5-5 4 4 3-3 6 6') + '<circle cx="16" cy="9" r="1.6"/>',
  miro: P('M4 4h8v8H4zM14 8h6v6h-6zM8 14h7v6H8z'),
  // business
  stripe: P('M3 6h18v12H3zM3 10h18M6 15h4'),
  posthog: P('M3 20h18M5 17l4-6 4 3 6-9') + P('M16 5h3v3'),
  // social
  instagram: P('M4 7h4l1.5-2.5h5L16 7h4v12H4z') + '<circle cx="12" cy="13" r="3.4"/>',
  facebook: P('M4 4h16v13H11l-5 4v-4H4z') + P('M8 9h8M8 12.5h5'),
  threads: P('M5 4h14v11H12l-4 4v-4H5z') + P('M9 15v4M15 15h0') + P('M9 8.5h6M9 11.5h4'),
  youtube: P('M3 6h18v12H3z') + P('M10 9v6l5-3z'),
  linkedin: P('M4 8h16v11H4zM9 8V5h6v3M4 13h16'),
  x: P('M4 12h4M16 12h4M12 4v4M12 16v4') + P('M6.5 6.5l3 3M14.5 14.5l3 3M17.5 6.5l-3 3M9.5 14.5l-3 3'),
  tiktok: P('M10 17V5l9-2v12') + '<circle cx="7" cy="17" r="3"/><circle cx="16" cy="15" r="3"/>',
  'web-reader': '<circle cx="12" cy="10" r="6"/>' + P('M6 10h12M12 4c2 2 2 10 0 12M12 4c-2 2-2 10 0 12') + P('M5 19h14M8 22h8'),
  firecrawl: P('M6 3h9l4 4v14H6z') + P('M9 11h7M9 14h7M9 17h4') + P('M15 3v4h4'),
  activepieces: P('M5 5h5a2 2 0 1 1 4 0h5v5a2 2 0 1 1 0 4v5h-5a2 2 0 1 0-4 0H5z'),
  'activepieces-self': P('M5 5h5a2 2 0 1 1 4 0h5v5a2 2 0 1 1 0 4v5h-5a2 2 0 1 0-4 0H5z'),
  n8n: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/>' + P('M7.5 12h4l5-6M11.5 12l5 6'),
  bluesky: P('M7 14a5 5 0 0 1 10 0') + P('M3 14h18M6 18h12') + P('M12 4v2M5 7l1.5 1.5M19 7l-1.5 1.5'),
  mastodon: P('M4 5h16v10h-9l-5 4v-4H4z') + '<circle cx="8.5" cy="10" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="15.5" cy="10" r="1"/>',
}
const PLUG = P('M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3')


const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

export function markOf(id: string, name = id): { letters: string; color: string } {
  const m = MARKS[id]
  if (m) return { letters: m[0], color: m[1] }
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
  return { letters: ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).replace(/^./, (c) => c.toUpperCase()), color: '#6b7280' }
}

export function IntegrationMark({ id, name, size = 22 }: { id: string; name?: string; group?: string; size?: number }) {
  const { color } = markOf(id, name)
  const ink = lum(color) > 0.45 ? '#1a1a1a' : '#ffffff'
  const s = size
  // the pictogram sits a little up and left, clear of the cut corner
  const k = (s * 0.66) / 24
  const glyph = GLYPH[id] ?? PLUG
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<path d="M0 0H${s}V${s * 0.74}L${s * 0.74} ${s}H0Z" fill="${color}"/>` +
    // a dark tile keeps an edge on a dark page
    (lum(color) < 0.04 ? `<path d="M.5 .5H${s - 0.5}V${s * 0.74 - 0.2}L${s * 0.74 - 0.2} ${s - 0.5}H.5Z" fill="none" stroke="#fff" stroke-opacity=".28"/>` : '') +
    `<g transform="translate(${s * 0.14} ${s * 0.13}) scale(${k})" fill="none" stroke="${ink}" stroke-width="${Math.max(1.8, 2.3 * (22 / s))}" stroke-linejoin="miter" stroke-linecap="square">${glyph}</g>` +
    `</svg>`
  return <span className="int-mark" aria-hidden="true" style={{ width: s, height: s }} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Every pictogram the app draws, for tests and the catalog. */
export const GLYPH_IDS = Object.keys(GLYPH)
