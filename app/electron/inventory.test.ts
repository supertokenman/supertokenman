import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { componentsIn, consolidateMessage, inventory, stemOf } from './inventory'

/** A small project on disk, built by each test that needs one. */
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'stm-inv-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('component inventory', () => {
  it('finds function and arrow components with their props, and skips plain functions', () => {
    const t = `type P = { a: string; b?: number }\nexport function A({ a, b }: P) { return <i/> }\nconst B = (props: { x: string; y: boolean }) => <b/>\nexport function helper(n: number) { return n * 2 }\nconst C = memo(({ z = 1, ...rest }) => (<div/>))`
    expect(componentsIn('f.tsx', t).map((c) => [c.name, c.props])).toEqual([['A', ['a', 'b']], ['B', ['x', 'y']], ['C', ['z', 'rest']]])
    expect(componentsIn('Card.vue', 'defineProps<{ title: string; count?: number }>()')).toEqual([{ name: 'Card', file: 'Card.vue', line: 1, props: ['title', 'count'] }])
    expect(componentsIn('Item.svelte', '<script>export let label; export let done = false</script>')[0]!.props).toEqual(['label', 'done'])
  })
  it('names look-alikes by their stem', () => {
    expect(stemOf('PrimaryButton')).toBe('button')
    expect(stemOf('Btn')).toBe('button')
    expect(stemOf('Dialog')).toBe('modal')
    expect(stemOf('ModalWrapper')).toBe('modal')
  })
  it('does not call a component unused when it is passed by name', () => {
    const root = project({
      'src/parts.tsx': 'export const Lonely = () => <i />\nexport const Passed = () => <b />\n',
      'src/routes.tsx': "import { Passed } from './parts'\nexport const routes = { home: Passed }\n",
    })
    expect(inventory(root).unused).toEqual(['Lonely'])
  })
  it('counts uses across the project, finds look-alikes and unused ones, and leaves node_modules out', () => {
    const root = project({
      'src/components/Button.tsx': 'type Props = { label: string; onClick: () => void; variant?: string }\nexport function Button({ label, onClick, variant }: Props) { return <button onClick={onClick}>{label}{variant}</button> }\n',
      'src/components/Btn.tsx': 'export const Btn = (props: { text: string }) => <button>{props.text}</button>\n',
      'src/components/Modal.tsx': 'export function Modal({ open, title, children }: { open: boolean; title: string; children: string }) { return open ? <div>{title}{children}</div> : null }\n',
      'src/components/Dialog.tsx': 'export const Dialog = ({ isOpen }: { isOpen: boolean }) => <div>{String(isOpen)}</div>\n',
      'src/components/Card.tsx': 'export function Card({ title }: { title: string }) { return <div>{title}</div> }\n',
      'src/pages/index.tsx': [
        "import { Button } from '../components/Button'",
        "import { Modal } from '../components/Modal'",
        'export default function Home() {',
        '  return <main><Button label="a" onClick={() => {}} /><Button label="b" onClick={() => {}} variant="ghost" /><Modal open title="t">x</Modal></main>',
        '}',
        '',
      ].join('\n'),
      'node_modules/lib/Foo.tsx': 'export function Foo() { return <i /> }\n',
    })
    const inv = inventory(root)
    const by = Object.fromEntries(inv.components.map((c) => [c.name, c]))
    expect(Object.keys(by).sort()).toEqual(['Btn', 'Button', 'Card', 'Dialog', 'Home', 'Modal'])
    expect(by.Dialog!.props).toEqual(['isOpen'])
    expect(by.Button).toMatchObject({ uses: 2, props: ['label', 'onClick', 'variant'], usedIn: ['src/pages/index.tsx'] })
    expect(by.Modal!.props).toEqual(['open', 'title', 'children'])
    expect(inv.lookalikes).toEqual([{ key: 'button', names: ['Btn', 'Button'] }, { key: 'modal', names: ['Dialog', 'Modal'] }])
    expect(inv.unused.sort()).toEqual(['Btn', 'Card', 'Dialog'])
    expect(consolidateMessage(inv, 'button')).toContain('Button in src/components/Button.tsx:2')
  })
})
