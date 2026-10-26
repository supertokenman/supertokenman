// How risky a shell command is, before it runs: safe, asks (changes things that can be undone or
// reach the network), or blocked (destroys data, the disk, the machine or secrets). Used by the
// terminal before Enter and by the command bar before Run.

export type Risk = { level: 'safe' | 'ask' | 'blocked'; why: string }

const BLOCKED: [RegExp, string][] = [
  [/\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+-?[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*\s+-?[a-zA-Z]*[rR]|-[a-zA-Z]*(?:rf|fr)[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\b[^|;&]*?(?:\s|^)(?:\/|~\/?|\$HOME\/?|\*|\.\/?\*?|\.\.)(?:\s|$)/, 'deletes a whole folder tree (/, ~, * or ..) with no way back'],
  [/\bmkfs(?:\.\w+)?\b|\bdd\b[^|;&]*\bof=\/dev\/(?!null\b)|\bdiskutil\s+(?:erase\w*|zeroDisk|secureErase|partitionDisk)\b/, 'writes over a disk'],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, 'a fork bomb: it freezes the machine'],
  [/\bchmod\s+-R\s+(?:0?777|a\+rwx)\s+\/(?:\s|$)|\bchown\s+-R\b[^|;&]*\s\/(?:\s|$)/, 'changes permissions of the whole disk'],
  [/>\s*\/dev\/sd[a-z]\b|>\s*\/dev\/disk\d/, 'writes over a disk'],
  [/\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|fi)?sh\b/, 'runs a script from the internet without reading it'],
  [/\bgit\s+push\b[^|;&]*(?:\s--force\b|\s-f\b)(?![-\w])[^|;&]*\b(?:main|master|production|prod)\b/, 'force-pushes over a main branch'],
  [/\b(?:DROP\s+(?:DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, 'drops a database or empties a table'],
  [/\b(?:shutdown|halt|poweroff|reboot)\b(?:\s|$)/, 'turns the machine off or restarts it'],
  [/\bsecurity\s+(?:delete-keychain|dump-keychain)\b|\bcat\b[^|;&]*(?:id_rsa|id_ed25519|\.aws\/credentials)\b[^|;&]*\|\s*(?:curl|nc|wget)/, 'touches the keychain or sends a private key out'],
]

const ASK: [RegExp, string][] = [
  [/\bsudo\b/, 'runs as administrator'],
  [/\brm\s+-[a-zA-Z]*[rRf]/, 'deletes files without asking'],
  [/\bgit\s+(?:push\b[^|;&]*(?:--force|\s-f\b)|reset\s+--hard|clean\s+-[a-zA-Z]*[fdx]|checkout\s+--\s|branch\s+-D|stash\s+drop|rebase\b)/, 'rewrites or throws away git history or changes'],
  [/\b(?:npm|pnpm|yarn|bun)\s+(?:publish|unpublish|deprecate)\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgh\s+release\s+create\b/, 'publishes a package or release'],
  [/\b(?:kubectl|helm)\s+(?:delete|uninstall|drain)\b|\bterraform\s+(?:apply|destroy)\b|\bwrangler\s+(?:deploy|delete|d1\s+execute\b[^|;&]*--remote)|\b(?:fly|flyctl)\s+(?:deploy|destroy|apps\s+destroy)\b|\bvercel\s+(?:--prod|deploy\s+--prod)|\baws\s+\S+\s+(?:delete|terminate|rm)\b|\bgcloud\b[^|;&]*\bdelete\b|\bdocker\s+(?:system\s+prune|volume\s+rm|rm\s+-f)\b/, 'changes or deletes something in the cloud or in production'],
  [/\bchmod\s+-R\b|\bchown\s+-R\b/, 'changes permissions of a whole tree'],
  [/\bkill(?:all)?\s+-9\b|\bpkill\b/, 'kills processes'],
  [/\b(?:DELETE\s+FROM|UPDATE\s+\w+\s+SET|DROP\s+TABLE|ALTER\s+TABLE)\b/i, 'changes data in a database'],
  [/\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b[^|;&]*\s-g\b|\bbrew\s+(?:uninstall|remove)\b|\bpip\s+uninstall\b/, 'installs or removes software for the whole machine'],
  [/(?:^|[^>])>\s*[^\s>&|]+\.(?:env|pem|key)\b|\bmv\b[^|;&]*\s\/(?:etc|usr|bin|System)\b/, 'overwrites a secret or a system file'],
]

/** The risk of one command line; the first rule that matches decides. */
export function riskOf(cmd: string): Risk {
  const c = cmd.trim()
  if (!c) return { level: 'safe', why: '' }
  // text in quotes is data (a grep pattern, a commit message), except for SQL, which lives in quotes
  const bare = c.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""')
  const sql = (why: string) => why.includes('database')
  for (const [re, why] of BLOCKED) if (re.test(sql(why) ? c : bare)) return { level: 'blocked', why }
  for (const [re, why] of ASK) if (re.test(sql(why) ? c : bare)) return { level: 'ask', why }
  return { level: 'safe', why: '' }
}

/** The command on a terminal line: what follows the last prompt sign, else the whole line. */
export function commandOnLine(line: string): string {
  const l = line.replace(/\s+$/, '')
  const m = /^.*?(?:[$%#❯›»]|>)\s(.*)$/.exec(l)
  return (m ? m[1]! : l).trim()
}
