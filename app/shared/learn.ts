// Learn by building: a tutor that gives hints instead of writing the code, flashcards on spaced repetition
// (SM-2, the SuperMemo 2 schedule), and a design review of a Spec first plan. Project ideas link to
// build-your-own-x (CC0) and are described in our words.

import { CHECKLIST } from './archdesk.js'

export type Card = { id: string; deck: string; front: string; back: string; due: number; ease: number; interval: number; reps: number }
export type Grade = 0 | 3 | 4 | 5 // again, hard, good, easy

const DAY = 86_400_000

/** The SM-2 step: a failed card comes back tomorrow; a passed one waits longer each time. */
export function review(c: Card, g: Grade, now = Date.now()): Card {
  if (g < 3) return { ...c, reps: 0, interval: 1, due: now + DAY, ease: Math.max(1.3, c.ease - 0.2) }
  const reps = c.reps + 1
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(c.interval * c.ease)
  const ease = Math.max(1.3, c.ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)))
  return { ...c, reps, interval, ease, due: now + interval * DAY }
}

export const newCard = (deck: string, front: string, back: string, now = Date.now()): Card => ({ id: `c${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, deck, front: front.trim(), back: back.trim(), due: now, ease: 2.5, interval: 0, reps: 0 })
export const dueCards = (cards: Card[], now = Date.now()) => cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due)

/** A starter deck from the design checklist: the question on the front, the idea and its source on the back. */
export const designDeck = (now = Date.now()): Card[] => CHECKLIST.map((c, i) => ({ ...newCard('System design', c.ask, `${c.area}. Source: ${c.source} (${c.link})`, now), id: `sd${i}` }))

/** Cards from text where each block is "front :: back" or a "Q:"/"A:" pair. */
export function parseCards(text: string, deck: string, now = Date.now()): Card[] {
  const out: Card[] = []
  for (const line of text.split('\n')) {
    const m = /^(.+?)\s*::\s*(.+)$/.exec(line.trim())
    if (m) out.push(newCard(deck, m[1]!, m[2]!, now))
  }
  for (const m of text.matchAll(/^Q:\s*(.+)\n+A:\s*([\s\S]+?)(?=\n\s*\nQ:|\nQ:|$)/gm)) out.push(newCard(deck, m[1]!, m[2]!.trim(), now))
  return out.map((c, i) => ({ ...c, id: `${c.id}${i}` }))
}

const BYOX = 'https://github.com/codecrafters-io/build-your-own-x'
export type Project = { id: string; title: string; why: string; steps: string[]; link: string }
export const PROJECTS: Project[] = [
  { id: 'git', title: 'Your own Git', why: 'Objects, hashes and trees: why a commit is cheap and a branch is a file.', steps: ['hash-object and cat-file', 'write-tree from a folder', 'commit-tree with a parent', 'a log that walks parents'], link: BYOX },
  { id: 'http', title: 'Your own HTTP server', why: 'Sockets, parsing and keep-alive: what a framework does for you.', steps: ['accept a socket and read a request line', 'parse headers and a body', 'route by path and method', 'serve files with the right content type'], link: BYOX },
  { id: 'redis', title: 'Your own Redis', why: 'A protocol, an event loop and expiry: how a fast cache works.', steps: ['parse RESP', 'GET and SET in memory', 'expiry with PX', 'many clients at once'], link: BYOX },
  { id: 'shell', title: 'Your own shell', why: 'Processes, pipes and signals: what happens when you press Enter.', steps: ['run a command with fork and exec', 'built-ins: cd and exit', 'pipes between commands', 'Ctrl-C without killing the shell'], link: BYOX },
  { id: 'db', title: 'Your own database', why: 'Pages, B-trees and a write-ahead log: how data survives a crash.', steps: ['a table in a file of fixed pages', 'a B-tree index', 'a SELECT with WHERE', 'a write-ahead log and recovery'], link: BYOX },
  { id: 'interpreter', title: 'Your own interpreter', why: 'Tokens, a parser and an evaluator: how code becomes behaviour.', steps: ['a tokenizer', 'a parser to an AST', 'evaluate expressions and variables', 'functions and closures'], link: BYOX },
]

/** The tutor's rule: guide, ask, hint; never hand over the solution unless asked twice. */
export const TUTOR_RULE = 'You are a tutor, not a coder, in this panel. Do not write the solution or edit files for me. Ask what I tried, point at the concept and the next small step, give a hint, then a stronger hint if I am stuck. Show at most a few lines of code to illustrate an idea, never a full answer, unless I explicitly ask for the answer twice. When I finish a step, quiz me with one question and suggest a flashcard as "front :: back".'

export const tutorPrompt = (p: Project) => `${TUTOR_RULE}\n\nProject: ${p.title}. ${p.why}\nSteps:\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nStart with step 1: ask me which language I want and what I already know, then give me only the first hint.`

/** A design review of a Spec first plan with the architecture checklist. */
export function planReviewPrompt(spec: string, plan: string): string {
  return [
    `Review this plan for the spec "${spec}" as a design reviewer. Do not edit files.`,
    'For each checklist item that applies, say what the plan covers, what it misses, and one change. Then list the risks in order and the questions to answer before building.',
    '',
    ...CHECKLIST.map((c, i) => `${i + 1}. ${c.area}: ${c.ask}`),
    '',
    'The plan:',
    '```markdown',
    plan.slice(0, 30_000),
    '```',
  ].join('\n')
}
