#!/usr/bin/env node
// Own controls, no macOS defaults (docs/BRAND.md, decided 2026-10-27): fails when app/src draws a control
// the system would draw. Checked on the TypeScript syntax tree, not on text, so a component's own `title`
// prop or a word in a string does not count. Flagged:
//   <select>, <datalist>, <input type="checkbox|radio|range|number|date|time|datetime-local|month|week|color|file">,
//   a `title` attribute on an HTML element (the system tooltip; use data-tip), and confirm(), alert(), prompt().
// The kit in src/ui draws its faces over real inputs, so it is allowed. Any other exception carries a
// comment `no-native-ui: <reason>` on the line or the line above.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
// the kit itself: these files are where the real inputs live, under our own faces
const KIT = /^src\/ui\//
const TYPES = new Set(['checkbox', 'radio', 'range', 'number', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'file'])
const KIT_FOR = { checkbox: 'Checkbox or Switch', radio: 'Radio', range: 'Slider', number: 'NumberField', date: 'DateField', time: 'TimeField', 'datetime-local': 'DateTimeField', month: 'DateField', week: 'DateField', color: 'ColorField', file: 'pickFile (src/FilePicker.tsx)' }
// an iframe's title is its accessible name; Chromium draws no tooltip for it
const TITLE_OK = new Set(['iframe'])

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|mts)$/.test(n) && !/\.test\.tsx?$/.test(n) && !n.endsWith('.d.ts') ? [p] : []
  })
}

export function check(file, text) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const kit = KIT.test(rel)
  const lines = text.split('\n')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const allowed = (pos) => {
    const l = sf.getLineAndCharacterOfPosition(pos).line
    return /no-native-ui:/.test(lines[l] ?? '') || /no-native-ui:/.test(lines[l - 1] ?? '')
  }
  const flag = (node, msg) => {
    if (allowed(node.getStart())) return
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
    out.push(`${rel}:${line + 1}: ${msg}`)
  }
  const visit = (n) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText()
      const attr = (name) => n.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name)
      if (!kit && tag === 'select') flag(n, '<select>: use Select from src/ui')
      if (tag === 'datalist') flag(n, '<datalist>: use Combobox from src/ui')
      if (!kit && tag === 'input') {
        const t = attr('type')
        const v = t?.initializer && ts.isStringLiteral(t.initializer) ? t.initializer.text : null
        if (v && TYPES.has(v)) flag(n, `<input type="${v}">: use ${KIT_FOR[v]}`)
        if (attr('list')) flag(n, '<input list>: use Combobox from src/ui')
      }
      if (/^[a-z]/.test(tag) && !TITLE_OK.has(tag) && attr('title')) flag(n, `title= on <${tag}> draws the system tooltip: use data-tip (and aria-label when it has no words)`)
    }
    if (ts.isCallExpression(n)) {
      const e = n.expression
      const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && /^(window|globalThis|self)$/.test(e.expression.text) ? e.name.text : null
      if (name && /^(confirm|alert|prompt)$/.test(name)) flag(n, `${name}(): use ${name}Dialog from src/ui`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = files(SRC).flatMap((f) => check(f, readFileSync(f, 'utf8')))
  if (all.length) {
    console.error(`no-native-ui: ${all.length} control${all.length === 1 ? '' : 's'} the system would draw (docs/BRAND.md, "Own controls"):\n${all.join('\n')}`)
    process.exit(1)
  }
  console.log('no-native-ui: ok, every control in src is our own')
}
