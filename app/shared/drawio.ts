// Diagrams as draw.io files: the mxGraph XML read into cells (shapes and arrows), drawn by the app, cut
// down to a selection so only those shapes go to the model, the model's edit merged back by id, two
// versions compared cell by cell, and a database's tables written as an ER diagram. The idea of
// "the model writes draw.io XML, you keep an editable file" is next-ai-draw-io's (Apache-2.0).

export type Geo = { x: number; y: number; w: number; h: number }
export type Cell = { id: string; parent: string; value: string; style: string; vertex: boolean; edge: boolean; source?: string; target?: string; geo?: Geo; xml: string }

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? unescapeXml(m[1]!) : undefined
}
export const unescapeXml = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#xa;|&#10;/gi, '\n').replace(/&amp;/g, '&')
export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#xa;')

/** The <mxGraphModel> inside a model's answer: in a code fence, bare, or inside an <mxfile>. */
export function extractModel(text: string): string | null {
  const m = /<mxGraphModel[\s\S]*?<\/mxGraphModel>/.exec(text)
  return m ? m[0] : null
}

/** Each cell of the model, in document order; object/UserObject wrappers give their label and id. */
export function cells(model: string): Cell[] {
  const out: Cell[] = []
  const re = /<(UserObject|object)\b([^>]*)>\s*(<mxCell\b[\s\S]*?(?:\/>|<\/mxCell>))\s*<\/\1>|<mxCell\b[^>]*?(?:\/>|>[\s\S]*?<\/mxCell>)/g
  for (const m of model.matchAll(re)) {
    const wrap = m[1] ? m[2]! : ''
    const cell = m[3] ?? m[0]
    const head = /<mxCell\b[^>]*?\/?>/.exec(cell)![0]
    const g = /<mxGeometry\b[^>]*>/.exec(cell)?.[0]
    const num = (k: string) => Number(g && attr(g, k)) || 0
    out.push({
      id: (wrap ? attr(` ${wrap}`, 'id') : undefined) || attr(head, 'id') || '',
      parent: attr(head, 'parent') ?? '',
      value: (wrap ? attr(` ${wrap}`, 'label') : undefined) ?? attr(head, 'value') ?? '',
      style: attr(head, 'style') ?? '',
      vertex: attr(head, 'vertex') === '1',
      edge: attr(head, 'edge') === '1',
      source: attr(head, 'source'),
      target: attr(head, 'target'),
      geo: g && !/relative="1"/.test(g) ? { x: num('x'), y: num('y'), w: num('width'), h: num('height') } : undefined,
      xml: m[0],
    })
  }
  return out
}

export type Check = { ok: boolean; problems: string[] }

/** What would stop draw.io from opening the model: no root cells, repeated ids, arrows to nowhere. */
export function check(model: string): Check {
  const problems: string[] = []
  if (!/^<mxGraphModel[\s>]/.test(model.trim()) || !/<\/mxGraphModel>\s*$/.test(model)) problems.push('Not an <mxGraphModel> … </mxGraphModel> document.')
  const cs = cells(model)
  const ids = cs.map((c) => c.id)
  if (!ids.includes('0') || !ids.includes('1')) problems.push('The two root cells (id 0 and 1) are missing.')
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length) problems.push(`Repeated ids: ${[...new Set(dup)].join(', ')}.`)
  const has = new Set(ids)
  for (const c of cs) {
    if (!c.id) problems.push('A cell without an id.')
    if (c.edge && ((c.source && !has.has(c.source)) || (c.target && !has.has(c.target)))) problems.push(`Arrow ${c.id} points at a shape that is not there.`)
    if (c.parent && !has.has(c.parent)) problems.push(`Cell ${c.id} sits in parent ${c.parent}, which is not there.`)
  }
  if ((model.match(/<mxCell\b/g)?.length ?? 0) !== cs.length) problems.push('Some cells could not be read; the XML may be cut off.')
  return { ok: problems.length === 0, problems }
}

/** A .drawio file around one model, uncompressed so git diffs stay readable. */
export const fileOf = (model: string, name = 'Page-1') => `<mxfile host="SuperTokenMan" type="device">\n  <diagram id="p1" name="${escapeXml(name)}">\n    ${model.trim()}\n  </diagram>\n</mxfile>\n`

/**
 * The model in a .drawio file. A compressed page (base64 of raw deflate of the URI-encoded XML, as
 * draw.io saves by default) is opened with the inflate function the caller passes.
 */
export function modelOf(file: string, inflate?: (b64: string) => string): string | null {
  const plain = extractModel(file)
  if (plain) return plain
  const page = /<diagram\b[^>]*>([\s\S]*?)<\/diagram>/.exec(file)?.[1]?.trim()
  if (!page || !inflate) return null
  try {
    return extractModel(decodeURIComponent(inflate(page)))
  } catch {
    return null
  }
}

/**
 * Only the selected shapes, plus the arrows between them, as a small model the prompt can carry; the
 * rest of the diagram is summed up in one line so the model knows what is around.
 */
export function selection(model: string, ids: string[]): { model: string; around: string } {
  const cs = cells(model)
  const pick = new Set(ids)
  for (const c of cs) if (c.edge && c.source && c.target && pick.has(c.source) && pick.has(c.target)) pick.add(c.id)
  const kept = cs.filter((c) => c.id === '0' || c.id === '1' || pick.has(c.id))
  const rest = cs.filter((c) => c.vertex && !pick.has(c.id) && c.value).map((c) => plain(c.value))
  return { model: `<mxGraphModel><root>\n${kept.map((c) => c.xml).join('\n')}\n</root></mxGraphModel>`, around: rest.length ? `Other shapes on the page: ${rest.slice(0, 40).join(', ')}.` : '' }
}

/**
 * The model's edit of a selection put back: cells with a known id are replaced, new ids are added, and
 * selected cells the edit left out are removed (with the arrows that pointed at them).
 */
export function mergeSelection(model: string, ids: string[], edited: string): string {
  const cs = cells(model)
  const sel = new Set(selection(model, ids).model.match(/\sid="([^"]+)"/g)?.map((s) => s.slice(5, -1)) ?? [])
  const next = cells(edited).filter((c) => c.id !== '0' && c.id !== '1')
  const nextById = new Map(next.map((c) => [c.id, c]))
  const removed = new Set([...sel].filter((id) => id !== '0' && id !== '1' && !nextById.has(id)))
  const out: string[] = []
  for (const c of cs) {
    if (removed.has(c.id) || (c.edge && ((c.source && removed.has(c.source)) || (c.target && removed.has(c.target))))) continue
    out.push(nextById.get(c.id)?.xml ?? c.xml)
    nextById.delete(c.id)
  }
  out.push(...[...nextById.values()].map((c) => c.xml))
  return `<mxGraphModel><root>\n${out.join('\n')}\n</root></mxGraphModel>`
}

export type CellDiff = { added: Cell[]; removed: Cell[]; changed: { before: Cell; after: Cell; what: string[] }[] }

/** Two versions cell by cell: what came, went, or changed its label, style, place or ends. */
export function diffCells(before: string, after: string): CellDiff {
  const a = new Map(cells(before).map((c) => [c.id, c]))
  const b = new Map(cells(after).map((c) => [c.id, c]))
  const changed: CellDiff['changed'] = []
  for (const [id, x] of b) {
    const y = a.get(id)
    if (!y) continue
    const what: string[] = []
    if (y.value !== x.value) what.push('label')
    if (y.style !== x.style) what.push('style')
    if (JSON.stringify(y.geo) !== JSON.stringify(x.geo)) what.push('place')
    if (y.source !== x.source || y.target !== x.target) what.push('ends')
    if (what.length) changed.push({ before: y, after: x, what })
  }
  return { added: [...b.values()].filter((c) => !a.has(c.id)), removed: [...a.values()].filter((c) => !b.has(c.id)), changed }
}

/** A label as text: draw.io labels may hold HTML. */
export const plain = (v: string) => v.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** draw.io style "rounded=1;fillColor=#fff" as a map. */
export const styleMap = (s: string) => Object.fromEntries(s.split(';').filter(Boolean).map((p) => (p.includes('=') ? [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)] : [p, '1'])))

/** The rules the model follows when it writes or edits a diagram. */
export const DRAWIO_RULES = [
  'Answer with one draw.io <mxGraphModel> only, no prose: <mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/> … </root></mxGraphModel>.',
  'Shapes: <mxCell id="…" value="label" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="…" y="…" width="…" height="…" as="geometry"/></mxCell>.',
  'Arrows: <mxCell id="…" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;" edge="1" parent="1" source="…" target="…"><mxGeometry relative="1" as="geometry"/></mxCell>.',
  'Ids are short and unique; every arrow names a source and a target that exist. Lay shapes on a grid of 10, left to right or top to bottom, without overlaps.',
].join('\n')

export const createPrompt = (ask: string) => `Draw this as a draw.io diagram:\n${ask}\n\n${DRAWIO_RULES}`
export const editPrompt = (ask: string, part: { model: string; around: string }, whole: boolean) =>
  `${whole ? 'Change this draw.io diagram' : 'Change only these shapes of a draw.io diagram; keep their ids, add new ids for new shapes, leave out a shape to delete it'}:\n${ask}\n\n${part.around}\n\n${part.model}\n\n${DRAWIO_RULES}`
export const imagePrompt = (hint: string) => `Redraw the diagram in this image as an editable draw.io diagram: the same boxes, labels and arrows, laid out cleanly.${hint ? ` ${hint}` : ''}\n\n${DRAWIO_RULES}`

type ErTable = { name: string; columns: { name: string; type: string; pk?: boolean }[] }
type ErFk = { from: string; column: string; to: string }

/** A database's tables and foreign keys as a draw.io ER diagram (draw.io's own table shapes). */
export function erModel(tables: ErTable[], fks: ErFk[], boxes: { name: string; x: number; y: number; w: number; h: number }[]): string {
  const id = (t: string) => `t_${t.replace(/[^\w]/g, '_')}`
  const out = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>']
  for (const t of tables) {
    const b = boxes.find((x) => x.name === t.name)
    if (!b) continue
    const cols = t.columns.slice(0, 30)
    out.push(`<mxCell id="${id(t.name)}" value="${escapeXml(t.name)}" style="shape=table;startSize=28;container=1;collapsible=0;childLayout=tableLayout;fontStyle=1;align=center;html=1;" vertex="1" parent="1"><mxGeometry x="${b.x}" y="${b.y}" width="${b.w}" height="${28 + cols.length * 22}" as="geometry"/></mxCell>`)
    cols.forEach((c, i) => {
      out.push(`<mxCell id="${id(t.name)}_${i}" value="${escapeXml(`${c.pk ? 'PK ' : ''}${c.name}: ${c.type}`)}" style="text;align=left;spacingLeft=8;html=1;${c.pk ? 'fontStyle=1;' : ''}" vertex="1" parent="${id(t.name)}"><mxGeometry y="${28 + i * 22}" width="${b.w}" height="22" as="geometry"/></mxCell>`)
    })
  }
  fks.forEach((f, i) => {
    if (tables.some((t) => t.name === f.from) && tables.some((t) => t.name === f.to)) out.push(`<mxCell id="fk${i}" value="${escapeXml(f.column)}" style="edgeStyle=entityRelationEdgeStyle;endArrow=ERmandOne;startArrow=ERmany;html=1;" edge="1" parent="1" source="${id(f.from)}" target="${id(f.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`)
  })
  return `<mxGraphModel><root>\n${out.join('\n')}\n</root></mxGraphModel>`
}
