// Team channel file store: one append-only jsonl file per team under a folder. Caps, pruning and pins are the
// pure rules of shared/teamchannel.ts; this file only reads and writes. A pruned or pinned change rewrites the file.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as TC from '../shared/teamchannel.js'

export const TEAM_ID = /^[\w-]{1,80}$/

export class ChannelStore {
  private cache = new Map<string, TC.Post[]>()
  constructor(private dir: string, private caps: TC.Caps = TC.CHANNEL_CAPS) {}

  private file(team: string) {
    if (!TEAM_ID.test(team)) throw new Error('Not a team id.')
    return join(this.dir, `${team}.jsonl`)
  }

  posts(team: string): TC.Post[] {
    const hit = this.cache.get(team)
    if (hit) return hit
    const file = this.file(team)
    let posts: TC.Post[] = []
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try {
          posts.push(JSON.parse(line) as TC.Post)
        } catch {
          // a torn last line after a crash: skipped
        }
      }
      posts = TC.prune(posts, this.caps)
    }
    this.cache.set(team, posts)
    return posts
  }

  /** Appends one post; the stored post (body cut to the limit) comes back. */
  add(post: TC.Post): TC.Post {
    const before = this.posts(post.team)
    const after = TC.append(before, post, this.caps)
    this.cache.set(post.team, after)
    const stored = after.find((p) => p.id === post.id) ?? post
    mkdirSync(this.dir, { recursive: true })
    if (after.length === before.length + 1 && after.slice(0, before.length).every((p, i) => p === before[i])) appendFileSync(this.file(post.team), JSON.stringify(stored) + '\n')
    else this.rewrite(post.team, after)
    return stored
  }

  pin(team: string, id: string, on: boolean): TC.Post[] {
    const next = TC.setPinned(this.posts(team), id, on)
    this.cache.set(team, next)
    this.rewrite(team, next)
    return next
  }

  private rewrite(team: string, posts: TC.Post[]) {
    mkdirSync(this.dir, { recursive: true })
    const file = this.file(team)
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, posts.map((p) => JSON.stringify(p)).join('\n') + (posts.length ? '\n' : ''))
    renameSync(tmp, file)
  }
}
