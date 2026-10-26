import { describe, expect, it } from 'vitest'
import { applyFilters, collectionsOf, fieldsOf, fill, findPrompt, fromPromptsChat, parseCsv, searchPrompts, slashOf, slug, withVersion, type Prompt } from './workbench'

const p = (name: string, body = 'x', title = name): Prompt => ({ id: name, name, title, body, tags: [], at: 1 })

describe('workbench', () => {
  it('finds and fills fields in both styles', () => {
    const body = 'Review {{file}} for {{focus | security}}. Language: ${lang:TypeScript}. Again {{file}}.'
    expect(fieldsOf(body)).toEqual([{ name: 'file' }, { name: 'focus', default: 'security' }, { name: 'lang', default: 'TypeScript' }])
    expect(fill(body, { file: 'cart.ts', focus: '' })).toBe('Review cart.ts for security. Language: TypeScript. Again cart.ts.')
    expect(fill('{{who}} here', {})).toBe('{{who}} here')
  })

  it('reads /name and @tag', () => {
    expect(slashOf('/review-pr  src/a.ts')).toEqual({ name: 'review-pr', rest: 'src/a.ts' })
    expect(slashOf('not /a command')).toBeNull()
    const list = [p('review-pr'), p('review-sql'), p('linux-terminal')]
    expect(findPrompt(list, 'linux')!.name).toBe('linux-terminal')
    expect(findPrompt(list, 'review')).toBeNull()
    expect(collectionsOf('Summarise @contracts and @Invoices please @nobody', ['contracts', 'invoices'])).toEqual({ tags: ['contracts', 'invoices'], text: 'Summarise and please @nobody' })
    expect(slug('Ação Rápida: Git!')).toBe('acao-rapida-git')
  })

  it('adds filters as visible rules', () => {
    expect(applyFilters('Hi', [])).toBe('Hi')
    expect(applyFilters('Hi', ['concise', 'pt-br'])).toBe('Hi\n\n[Filters]\n- Answer in at most 120 words.\n- Answer in Brazilian Portuguese.')
  })

  it('reads the prompts.chat CSV', () => {
    const csv = 'act,prompt,for_devs,type,contributor\nLinux Terminal,"I want you to act as a linux terminal. Say ""hi"",\nthen wait.",TRUE,TEXT,f\nImage Thing,"draw",FALSE,IMAGE,x\nLinux Terminal,"second",FALSE,TEXT,y\n'
    expect(parseCsv(csv)[1]![1]).toBe('I want you to act as a linux terminal. Say "hi",\nthen wait.')
    const list = fromPromptsChat(csv, 5)
    expect(list.map((x) => [x.name, x.tags, x.source])).toEqual([['linux-terminal', ['dev'], 'prompts.chat'], ['linux-terminal-2', [], 'prompts.chat']])
    expect(searchPrompts([p('a', 'about linux', 'Shell'), p('linux-terminal', 'x', 'Linux Terminal')], 'linux').map((x) => x.name)).toEqual(['linux-terminal', 'a'])
  })

  it('keeps versions of a prompt', () => {
    const a = p('r', 'one')
    const b = withVersion(a, { ...a, body: 'two', at: 2 }, 'shorter')
    expect(b.versions).toEqual([{ at: 1, body: 'one', note: 'shorter' }])
    expect(withVersion(b, { ...b, title: 'R' }).versions).toHaveLength(1)
  })
})
