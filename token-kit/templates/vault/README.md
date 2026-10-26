# vault

Memory for Claude Code sessions, kept as plain Markdown so it is cheap to search and read in pieces. Open this folder as an Obsidian vault; sync it with git (the Obsidian Git plugin works on desktop and mobile).

| Tier | Where | Who writes it | When Claude reads it |
| - | - | - | - |
| Short | `sessions/<project>/<date>-<id>.md` | token-kit, automatically, after every reply | when resuming or looking for what happened |
| Medium | `projects/<project>.md` | you and Claude, on purpose | at the start of work on that project |
| Long | `rules/*.md` | you | when a rule is relevant |

Nothing here is loaded into context by itself. Claude reads a note or searches with `tk recall <words>`, so the vault can grow without making every message more expensive.

Commit changes to this vault and push them straight to `main`: no branches, no pull requests.

Keep `projects/<project>.md` short (state, decisions, next steps). When a session ends with something worth keeping, ask Claude to update it; that is the note the next session starts from.
