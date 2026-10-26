import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digest, graph, graphCached, projectName, readNote, remember, search, sessionNotes, vaultDir } from './memory'

function vault() {
  const v = mkdtempSync(join(tmpdir(), 'stm-vault-'))
  mkdirSync(join(v, 'rules'))
  mkdirSync(join(v, 'sessions', 'engine'), { recursive: true })
  mkdirSync(join(v, 'sessions', 'studio'), { recursive: true })
  writeFileSync(join(v, 'rules', 'communication.md'), '# Rules\n\nPush vault changes to main, no CI.\n')
  writeFileSync(join(v, 'sessions', 'engine', '2026-10-20-aaaa1111.md'), '---\ndate: 2026-10-20\n---\n\n# Schedule posts from R2\n\n## Last answer (excerpt)\n\n> The queue now reads the R2 bucket and publishes on time.\n')
  writeFileSync(join(v, 'sessions', 'engine', '2026-10-22-bbbb2222.md'), '---\ndate: 2026-10-22\n---\n\n# Add caption field\n\nqueue legenda field\n')
  writeFileSync(join(v, 'sessions', 'studio', '2026-10-21-cccc3333.md'), '# Render reels\n\nqueue of renders\n')
  return v
}

describe('memory', () => {
  it('finds the vault from token-kit config', () => {
    const home = mkdtempSync(join(tmpdir(), 'stm-home-'))
    mkdirSync(join(home, '.claude', 'token-kit'), { recursive: true })
    writeFileSync(join(home, '.claude', 'token-kit', 'config.json'), JSON.stringify({ vault: { path: '~/vault' } }))
    const prev = process.env.CLAUDE_CONFIG_DIR
    delete process.env.CLAUDE_CONFIG_DIR
    expect(vaultDir(home)).toBe(join(home, 'vault'))
    process.env.CLAUDE_CONFIG_DIR = prev
    expect(projectName('/Users/y/bzcorrida/engine')).toBe('engine')
  })

  it('searches rules first and keeps other projects out', () => {
    const v = vault()
    expect(search(v, 'push main').map((h) => h.file)).toEqual([join('rules', 'communication.md')])
    expect(search(v, 'queue', 'engine').every((h) => !h.file.includes('studio'))).toBe(true)
    expect(search(v, 'queue').some((h) => h.file.includes('studio'))).toBe(true)
  })

  it('lists session notes newest first with the last answer', () => {
    const notes = sessionNotes(vault(), 'engine')
    expect(notes.map((n) => n.title)).toEqual(['Add caption field', 'Schedule posts from R2'])
    expect(notes[1]!.excerpt).toContain('publishes on time')
  })

  it('appends to the project note and reads notes inside the vault only', () => {
    const v = vault()
    const file = remember(v, 'engine', 'Caption field', 'The queue stores `legenda` next to each post.', new Date('2026-10-22T12:00:00Z'))
    expect(readFileSync(join(v, file), 'utf8')).toContain('## 2026-10-22 Caption field\n\nThe queue stores')
    expect(readNote(v, file)).toContain('Caption field')
    expect(() => readNote(v, '../../etc/passwd')).toThrow('Outside the vault')
    expect(() => remember('', 'engine', 't', 'x')).toThrow('tk vault init')
  })

  it('builds a graph: links, shared files and the project note', () => {
    const v = mkdtempSync(join(tmpdir(), 'stm-g-'))
    mkdirSync(join(v, 'projects'))
    mkdirSync(join(v, 'rules'))
    mkdirSync(join(v, 'sessions', 'engine'), { recursive: true })
    writeFileSync(join(v, 'projects', 'engine.md'), '# engine\n\nSee [[communication]].')
    writeFileSync(join(v, 'rules', 'communication.md'), '# Communication\n')
    const note = (title: string, files: string[], usd: number) => `---\ndate: 2026-10-2${usd}\napi_value_usd: ${usd}.50\n---\n\n# ${title}\n\n## Files changed\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n\n## Commands\n\n- none\n`
    writeFileSync(join(v, 'sessions', 'engine', 'a.md'), note('Queue', ['src/queue.ts', 'src/r2.ts'], 1))
    writeFileSync(join(v, 'sessions', 'engine', 'b.md'), note('Captions', ['src/queue.ts', 'src/r2.ts', 'src/ig.ts'], 2))
    writeFileSync(join(v, 'sessions', 'engine', 'c.md'), note('Docs', ['README.md'], 3))
    const g = graph(v)
    expect(g.nodes.map((n) => [n.kind, n.title])).toEqual(expect.arrayContaining([['project', 'engine'], ['rule', 'Communication'], ['session', 'Queue']]))
    expect(g.nodes.find((n) => n.title === 'Captions')).toMatchObject({ project: 'engine', usd: 2.5, files: ['src/queue.ts', 'src/r2.ts', 'src/ig.ts'] })
    const e = g.edges.map((x) => `${x.why}:${x.a.split('/').pop()}>${x.b.split('/').pop()}:${x.weight}`)
    expect(e).toEqual(expect.arrayContaining(['link:engine.md>communication.md:1', 'project:a.md>engine.md:1', 'files:a.md>b.md:2']))
    expect(e.some((x) => x.startsWith('files:') && x.includes('c.md'))).toBe(false)
  })

  it('keeps the graph until a note changes', () => {
    const v = vault()
    const a = graphCached(v)
    expect(graphCached(v)).toBe(a)
    writeFileSync(join(v, 'rules', 'new.md'), '# New rule\n')
    const b = graphCached(v)
    expect(b).not.toBe(a)
    expect(b.nodes.some((n) => n.title === 'New rule')).toBe(true)
  })

  it('never keeps what was marked private, in a note or in a session digest', () => {
    const v = mkdtempSync(join(tmpdir(), 'vault-'))
    remember(v, 'app', 'Deploy <private>with key sk-1</private>', 'Used <private>password hunter2</private> on staging.')
    const note = readFileSync(join(v, 'projects', 'app.md'), 'utf8')
    expect(note).not.toMatch(/sk-1|hunter2/)
    expect(note).toContain('Used [private] on staging.')
    const jsonl = [
      JSON.stringify({ type: 'user', message: { content: 'connect with <private>token abc</private> please' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done, I used <private>token abc</private>.' }] } }),
    ].join('\n')
    const d = digest(jsonl)
    expect(d).not.toContain('abc')
    expect(d).toContain('connect with [private] please')
  })

  it('keeps the person\'s words in a digest, without interruption markers or the app\'s notes', () => {
    const jsonl = [
      JSON.stringify({ type: 'user', message: { content: 'please loop now' } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } }),
      JSON.stringify({ type: 'user', message: { content: "Read the spec\n\n[Also in this project's memory as Markdown with a table of contents: spec.pdf (as spec.md).]" } }),
    ].join('\n')
    expect(digest(jsonl)).toBe('Asked:\n- please loop now\n- Read the spec')
  })
})
