import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script
import { check } from './no-native-ui.mjs'

const at = (rel: string) => new URL(`../${rel}`, import.meta.url).pathname
const run = (src: string, file = 'src/X.tsx') => check(at(file), src) as string[]

describe('no-native-ui', () => {
  it('flags what the system would draw', () => {
    const out = run(`export const A = () => <div><select value="a" onChange={() => 0}><option>a</option></select><input type="checkbox" /><span title="x" /><datalist id="d" /></div>
const ok = confirm('sure?'); window.alert('x')`)
    expect(out.length).toBe(6)
  })
  it('leaves our own controls, component props and allowed exceptions alone', () => {
    expect(run(`export const A = () => <Section title="Settings"><Select value="a"><option>a</option></Select><Checkbox /><iframe title="Preview" /><span data-tip="x" /></Section>
window.stm.lock.prompt('unlock')`)).toEqual([])
    expect(run(`// no-native-ui: a reason\nexport const A = () => <input type="color" />`)).toEqual([])
    expect(run(`export const A = () => <input type="checkbox" />`, 'src/ui/controls.tsx')).toEqual([])
  })
})
