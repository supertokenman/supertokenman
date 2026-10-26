// Phase 91: architecture diagrams to start from, in the app's look: boxes with a 45° cut corner (draw.io's
// card shape), flat fills, mono labels. Generic roles only: no cloud vendor icons or names.
import { escapeXml } from './drawio.js'

export type Kind = 'client' | 'edge' | 'service' | 'store' | 'queue' | 'cache' | 'worker' | 'external'
type Node = { id: string; label: string; kind: Kind; x: number; y: number }
type Link = { from: string; to: string; label?: string; dashed?: boolean }
export type Template = { id: string; name: string; what: string; nodes: Node[]; links: Link[] }

const W = 150
const H = 60
const FILL: Record<Kind, { fill: string; line: string }> = {
  client: { fill: '#f4efe6', line: '#3b3934' },
  edge: { fill: '#f4efe6', line: '#d97757' },
  service: { fill: '#ffffff', line: '#3b3934' },
  store: { fill: '#ece6da', line: '#3b3934' },
  queue: { fill: '#ffffff', line: '#7a7a10' },
  cache: { fill: '#ffffff', line: '#2f6f8f' },
  worker: { fill: '#ffffff', line: '#3b3934' },
  external: { fill: '#ffffff', line: '#8a857b' },
}
const SHAPE: Record<Kind, string> = {
  client: 'shape=card;size=12;',
  edge: 'shape=card;size=12;',
  service: 'shape=card;size=12;',
  store: 'shape=cylinder3;size=10;boundedLbl=1;',
  queue: 'shape=card;size=12;',
  cache: 'shape=card;size=12;',
  worker: 'shape=card;size=12;',
  external: 'shape=card;size=12;dashed=1;',
}
const TAG: Record<Kind, string> = { client: 'CLIENT', edge: 'EDGE', service: 'SERVICE', store: 'STORE', queue: 'QUEUE', cache: 'CACHE', worker: 'WORKER', external: 'EXTERNAL' }

export const TEMPLATES: Template[] = [
  {
    id: 'three-tier', name: 'Web app, three tiers', what: 'Browser, load balancer, app servers, one database with a read replica.',
    nodes: [
      { id: 'c', label: 'Browser', kind: 'client', x: 40, y: 140 },
      { id: 'lb', label: 'Load balancer', kind: 'edge', x: 240, y: 140 },
      { id: 'a1', label: 'App server 1', kind: 'service', x: 440, y: 80 },
      { id: 'a2', label: 'App server 2', kind: 'service', x: 440, y: 200 },
      { id: 'db', label: 'Primary DB', kind: 'store', x: 640, y: 80 },
      { id: 'rr', label: 'Read replica', kind: 'store', x: 640, y: 200 },
    ],
    links: [{ from: 'c', to: 'lb', label: 'HTTPS' }, { from: 'lb', to: 'a1' }, { from: 'lb', to: 'a2' }, { from: 'a1', to: 'db', label: 'writes' }, { from: 'a2', to: 'rr', label: 'reads' }, { from: 'db', to: 'rr', label: 'replication', dashed: true }],
  },
  {
    id: 'queue-worker', name: 'Queue and workers', what: 'An API takes the request, a queue holds the job, workers do it and store the result.',
    nodes: [
      { id: 'c', label: 'Client', kind: 'client', x: 40, y: 120 },
      { id: 'api', label: 'API', kind: 'service', x: 240, y: 120 },
      { id: 'q', label: 'Job queue', kind: 'queue', x: 440, y: 120 },
      { id: 'w', label: 'Workers', kind: 'worker', x: 640, y: 120 },
      { id: 'db', label: 'Results DB', kind: 'store', x: 840, y: 120 },
      { id: 'dlq', label: 'Dead letters', kind: 'queue', x: 640, y: 240 },
    ],
    links: [{ from: 'c', to: 'api', label: 'POST /jobs' }, { from: 'api', to: 'q', label: 'enqueue' }, { from: 'q', to: 'w', label: 'pull' }, { from: 'w', to: 'db' }, { from: 'w', to: 'dlq', label: 'after retries', dashed: true }],
  },
  {
    id: 'event-driven', name: 'Events, publish and subscribe', what: 'Services publish events to a bus; each consumer keeps its own view.',
    nodes: [
      { id: 'o', label: 'Orders service', kind: 'service', x: 40, y: 140 },
      { id: 'bus', label: 'Event bus', kind: 'queue', x: 280, y: 140 },
      { id: 'b', label: 'Billing', kind: 'service', x: 520, y: 40 },
      { id: 'n', label: 'Notifications', kind: 'service', x: 520, y: 140 },
      { id: 's', label: 'Search indexer', kind: 'worker', x: 520, y: 240 },
      { id: 'idx', label: 'Search index', kind: 'store', x: 740, y: 240 },
    ],
    links: [{ from: 'o', to: 'bus', label: 'order.placed' }, { from: 'bus', to: 'b' }, { from: 'bus', to: 'n' }, { from: 'bus', to: 's' }, { from: 's', to: 'idx' }],
  },
  {
    id: 'gateway', name: 'Gateway and services', what: 'One gateway for auth and rate limits in front of services that each own their data.',
    nodes: [
      { id: 'c', label: 'Mobile and web', kind: 'client', x: 40, y: 140 },
      { id: 'g', label: 'API gateway', kind: 'edge', x: 240, y: 140 },
      { id: 'au', label: 'Auth', kind: 'service', x: 440, y: 20 },
      { id: 'u', label: 'Users service', kind: 'service', x: 440, y: 140 },
      { id: 'p', label: 'Payments service', kind: 'service', x: 440, y: 260 },
      { id: 'ud', label: 'Users DB', kind: 'store', x: 660, y: 140 },
      { id: 'pd', label: 'Payments DB', kind: 'store', x: 660, y: 260 },
      { id: 'psp', label: 'Payment provider', kind: 'external', x: 860, y: 260 },
    ],
    links: [{ from: 'c', to: 'g' }, { from: 'g', to: 'au', label: 'verify token' }, { from: 'g', to: 'u' }, { from: 'g', to: 'p' }, { from: 'u', to: 'ud' }, { from: 'p', to: 'pd' }, { from: 'p', to: 'psp', dashed: true }],
  },
  {
    id: 'cache-aside', name: 'Cache-aside reads', what: 'The service reads the cache first, falls back to the database and fills the cache.',
    nodes: [
      { id: 'c', label: 'Client', kind: 'client', x: 40, y: 120 },
      { id: 's', label: 'Service', kind: 'service', x: 240, y: 120 },
      { id: 'k', label: 'Cache', kind: 'cache', x: 460, y: 40 },
      { id: 'db', label: 'Database', kind: 'store', x: 460, y: 200 },
    ],
    links: [{ from: 'c', to: 's' }, { from: 's', to: 'k', label: '1 get' }, { from: 's', to: 'db', label: '2 on miss' }, { from: 'db', to: 'k', label: '3 set with TTL', dashed: true }],
  },
  {
    id: 'static-edge', name: 'Static site and functions', what: 'A CDN serves the static build; functions at the edge answer the API.',
    nodes: [
      { id: 'c', label: 'Browser', kind: 'client', x: 40, y: 140 },
      { id: 'cdn', label: 'CDN', kind: 'edge', x: 240, y: 140 },
      { id: 'st', label: 'Static files', kind: 'store', x: 460, y: 40 },
      { id: 'fn', label: 'Functions', kind: 'service', x: 460, y: 200 },
      { id: 'kv', label: 'Key-value store', kind: 'store', x: 680, y: 140 },
      { id: 'sq', label: 'SQL database', kind: 'store', x: 680, y: 260 },
    ],
    links: [{ from: 'c', to: 'cdn' }, { from: 'cdn', to: 'st', label: '/*' }, { from: 'cdn', to: 'fn', label: '/api/*' }, { from: 'fn', to: 'kv' }, { from: 'fn', to: 'sq' }],
  },
]

const cellStyle = (k: Kind) => `${SHAPE[k]}whiteSpace=wrap;html=1;fillColor=${FILL[k].fill};strokeColor=${FILL[k].line};strokeWidth=1.5;fontFamily=Inter;fontSize=13;fontColor=#1f1e1b;`

/** A template as a draw.io model, every box tagged with its role in mono capitals. */
export function templateModel(t: Template): string {
  const out = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
  for (const n of t.nodes) {
    const label = `<font face="JetBrains Mono" style="font-size:9px;letter-spacing:1px" color="#8a857b">${TAG[n.kind]}</font><br>${escapeXml(n.label)}`
    out.push(`<mxCell id="${n.id}" value="${escapeXml(label)}" style="${cellStyle(n.kind)}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${W}" height="${H}" as="geometry"/></mxCell>`)
  }
  t.links.forEach((l, i) => {
    out.push(`<mxCell id="e${i}" value="${escapeXml(l.label ?? '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#3b3934;endArrow=block;endFill=1;fontFamily=JetBrains Mono;fontSize=10;${l.dashed ? 'dashed=1;' : ''}" edge="1" parent="1" source="${l.from}" target="${l.to}"><mxGeometry relative="1" as="geometry"/></mxCell>`)
  })
  return `<mxGraphModel grid="1" gridSize="10"><root>\n${out.join('\n')}\n</root></mxGraphModel>`
}

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? null
