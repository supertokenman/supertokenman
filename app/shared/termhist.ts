// The terminal's history per project: what was run, searchable by meaning (words and their usual
// synonyms, in English and Portuguese), and the ghost suggestion for what is being typed.

export type HistItem = { cmd: string; at: number; n: number; cwd?: string }

const SYN: Record<string, string[]> = {
  delete: ['rm', 'remove', 'del', 'apagar', 'apaga', 'remover', 'deletar', 'excluir'],
  list: ['ls', 'listar', 'lista', 'show', 'mostrar'],
  install: ['i', 'add', 'instalar', 'instala'],
  test: ['tests', 'testar', 'testes', 'vitest', 'jest', 'pytest'],
  build: ['compile', 'compilar', 'buildar'],
  run: ['start', 'dev', 'rodar', 'roda', 'iniciar', 'serve'],
  find: ['search', 'grep', 'rg', 'procurar', 'buscar', 'achar'],
  branch: ['checkout', 'switch', 'galho'],
  commit: ['commitar', 'salvar'],
  push: ['enviar', 'subir'],
  pull: ['baixar', 'atualizar', 'update'],
  logs: ['log', 'tail', 'journal'],
  docker: ['container', 'containers', 'compose'],
  port: ['porta', 'lsof', 'listen'],
  kill: ['matar', 'stop', 'parar'],
  disk: ['df', 'du', 'space', 'espaco', 'disco'],
  database: ['db', 'banco', 'psql', 'sqlite', 'migrate', 'migration', 'migracao'],
}
const GROUP = new Map<string, string>()
for (const [k, vs] of Object.entries(SYN)) for (const w of [k, ...vs]) GROUP.set(w, k)

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9.]+/)
    .filter((w) => w.length > 1)
    .map((w) => GROUP.get(w) ?? w)

/** Adds a command; a repeat moves to the front and counts once more. Newest first, at most `keep`. */
export function remember(list: HistItem[], cmd: string, cwd?: string, at = Date.now(), keep = 500): HistItem[] {
  const c = cmd.trim()
  if (!c || c.length > 2000) return list
  const old = list.find((h) => h.cmd === c)
  return [{ cmd: c, at, n: (old?.n ?? 0) + 1, ...(cwd ? { cwd } : {}) }, ...list.filter((h) => h.cmd !== c)].slice(0, keep)
}

/** Commands matching a description by meaning, best first: shared words, then how often and how recently used. */
export function search(list: HistItem[], query: string, limit = 8, now = Date.now()): HistItem[] {
  const q = new Set(tokens(query))
  if (!q.size) return list.slice(0, limit)
  return list
    .map((h) => {
      const t = new Set(tokens(h.cmd))
      const hit = [...q].filter((w) => t.has(w) || [...t].some((x) => x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x)))).length
      const days = (now - h.at) / 86_400_000
      return { h, s: hit ? hit * 10 + Math.log2(1 + h.n) - Math.min(3, days / 30) : 0 }
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.h)
}

/** The rest of the most used command that starts with what is typed; empty when none. */
export function ghost(list: HistItem[], typed: string): string {
  if (!typed.trim()) return ''
  const best = list.filter((h) => h.cmd.startsWith(typed) && h.cmd !== typed).sort((a, b) => b.n - a.n || b.at - a.at)[0]
  return best ? best.cmd.slice(typed.length) : ''
}

/** What the local model is asked to turn a request into one command. */
export const commandPrompt = (request: string, shell: string, os: string, cwd: string, recent: string[]) =>
  [
    `Write one ${shell} command for ${os} that does what is asked, to run in ${cwd}.`,
    'Reply with the command only: no explanation, no code fence, one line (use && or pipes to join steps).',
    'Prefer read-only and reversible commands; never use sudo unless asked.',
    recent.length ? `Commands this person ran here lately, for the tools they use:\n${recent.slice(0, 8).join('\n')}` : '',
    `Asked: ${request.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n')

/** The command in a model's answer: the first code line, without fences, prompt signs or quotes. */
export function cleanCommand(text: string): string {
  const fenced = /```(?:\w+)?\n([\s\S]*?)```/.exec(text)
  const body = (fenced ? fenced[1]! : text).trim()
  const line = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#')) ?? ''
  return line.replace(/^\$\s+/, '').replace(/^`+|`+$/g, '').trim()
}
