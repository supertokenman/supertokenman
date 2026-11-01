// Numbered list of the interactive elements on a page, built from a DOM + accessibility snapshot.
// Pure: no electron, no fs. The main process sends the snapshot JSON; the model only ever sees the lines.
//
// Keep: visible, non-zero box, not occluded (the element at the box centre is the node or one of its
// descendants), interactive (role, tag or a click handler). Number in reading order (rows of 8 px, then
// left to right, then document order). Elements not in the previous list are marked `*`. Secret fields
// never show their value.

export type SnapBox = { x: number; y: number; w: number; h: number }

export type SnapNode = {
  id: number
  parent: number | null
  tag: string
  role?: string
  name?: string
  value?: string
  inputType?: string
  box: SnapBox | null
  hidden?: boolean
  clickable?: boolean
  secret?: boolean
  /** id of the element at the box centre (elementFromPoint), when the main process knows it */
  topAt?: number | null
}

export type Snapshot = { url?: string; nodes: SnapNode[] }

export type IndexedElement = {
  n: number
  id: number
  role: string
  name: string
  value?: string
  isNew: boolean
  secret: boolean
}

export type IndexResult = {
  elements: IndexedElement[]
  lines: string[]
  text: string
  /** interactive elements found, before the cap */
  total: number
  cut: boolean
}

export const MAX_ELEMENTS = 200
const NAME_MAX = 120
const VALUE_MAX = 80

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider', 'spinbutton',
])
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary'])
const INPUT_ROLE: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  search: 'searchbox',
  range: 'slider',
  number: 'spinbutton',
}

const squash = (s: string | undefined, max: number): string => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** The role a screen reader would give the node: explicit AX role first, then the tag. */
export function roleOf(node: SnapNode): string {
  if (node.role) return node.role
  if (node.tag === 'a') return 'link'
  if (node.tag === 'button' || node.tag === 'summary') return 'button'
  if (node.tag === 'select') return 'combobox'
  if (node.tag === 'textarea') return 'textbox'
  if (node.tag === 'input') return INPUT_ROLE[node.inputType ?? 'text'] ?? 'textbox'
  return node.tag
}

const isInteractive = (node: SnapNode, role: string): boolean =>
  INTERACTIVE_ROLES.has(role) || INTERACTIVE_TAGS.has(node.tag) || node.clickable === true

/** True when the element at the centre of the node's box is the node itself or one of its descendants. */
function uncovered(node: SnapNode, byId: Map<number, SnapNode>): boolean {
  if (node.topAt === undefined || node.topAt === null || node.topAt === node.id) return true
  let cur = byId.get(node.topAt)
  while (cur) {
    if (cur.id === node.id) return true
    cur = cur.parent === null ? undefined : byId.get(cur.parent)
  }
  return false
}

/**
 * The numbered list. `previous` is the id list of the last element list (undefined when there was none):
 * elements missing from it are new.
 */
export function indexElements(snap: Snapshot, previous?: number[]): IndexResult {
  const byId = new Map(snap.nodes.map((n) => [n.id, n] as const))
  const prev = previous ? new Set(previous) : undefined
  const candidates: { node: SnapNode; role: string; order: number; box: SnapBox }[] = []
  snap.nodes.forEach((node, order) => {
    if (node.hidden || !node.box || node.box.w <= 0 || node.box.h <= 0) return
    const role = roleOf(node)
    if (!isInteractive(node, role)) return
    if (!uncovered(node, byId)) return
    candidates.push({ node, role, order, box: node.box })
  })
  candidates.sort(
    (a, b) =>
      Math.round(a.box.y / 8) - Math.round(b.box.y / 8) || a.box.x - b.box.x || a.order - b.order,
  )
  const elements: IndexedElement[] = candidates.slice(0, MAX_ELEMENTS).map((c, i) => {
    const secret = c.node.secret === true || c.node.inputType === 'password'
    const value = secret ? '[hidden]' : c.node.value === undefined ? undefined : squash(c.node.value, VALUE_MAX)
    return {
      n: i + 1,
      id: c.node.id,
      role: c.role,
      name: squash(c.node.name, NAME_MAX),
      ...(value === undefined ? {} : { value }),
      isNew: prev ? !prev.has(c.node.id) : false,
      secret,
    }
  })
  const lines = elements.map(
    (e) => `${e.isNew ? '*' : ''}[${e.n}] ${e.role} ${JSON.stringify(e.name)}${e.value === undefined ? '' : ` value: ${e.value}`}`,
  )
  const total = candidates.length
  const cut = total > MAX_ELEMENTS
  const text = cut
    ? [...lines, `(${total - MAX_ELEMENTS} more not listed; scroll and call elements again)`].join('\n')
    : lines.join('\n')
  return { elements, lines, text, total, cut }
}
