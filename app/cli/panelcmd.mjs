// stm from inside a panel: the commands that act as the calling panel. Its identity comes from the
// panel's environment (STM_PANEL_ID and STM_PANEL_KEY, set by the app when it starts that panel's
// Claude Code); the app checks both, so a panel can only act as itself.

export const PANEL_HELP = `From inside a panel (STM_PANEL_ID is set; "$STM_CLI" works when PATH was reset):
  stm whoami                         this panel: id, project, model
  stm spawn [--cwd DIR] [--model ID] [--prompt "text"]
                                     open a new panel linked to this one; prints its id
  stm send <panel> "text"            put a labelled message in that panel's composer; the person sends it
  stm note get|set|append <name> [text]
                                     the project's shared notes (.supertokenman/notes, 64 KB each)
  stm link <panel>                   record a link between this panel and another
  stm links                          the panels linked to this one`

const ONLY_IN_PANEL = new Set(['whoami', 'spawn', 'note', 'link', 'links'])

/**
 * The request a panel command sends to the app, or null when `cmd` is not a panel command here
 * (outside a panel, `stm send` keeps its old meaning). Throws with a usage message when it is wrong.
 */
export function panelRequest(cmd, rest, flags, env) {
  const me = env.STM_PANEL_ID
  if (!me) {
    if (ONLY_IN_PANEL.has(cmd)) throw new Error(`stm ${cmd} runs from inside a SuperTokenMan panel (STM_PANEL_ID is not set).`)
    return null
  }
  const id = { me, key: env.STM_PANEL_KEY ?? '' }
  if (cmd === 'whoami') return { cmd: 'whoami', args: id }
  if (cmd === 'links') return { cmd: 'plinks', args: id }
  if (cmd === 'link') {
    if (!rest[0]) throw new Error('Usage: stm link <panel>')
    return { cmd: 'plink', args: { ...id, panel: rest[0] } }
  }
  if (cmd === 'spawn') {
    if (rest.length) throw new Error('Usage: stm spawn [--cwd DIR] [--model ID] [--prompt "text"]')
    for (const k of ['cwd', 'model', 'prompt']) if (k in flags && typeof flags[k] !== 'string') throw new Error(`--${k} needs a value.`)
    return { cmd: 'pspawn', args: { ...id, cwd: flags.cwd, model: flags.model, prompt: flags.prompt } }
  }
  if (cmd === 'send') {
    const [panel, ...words] = rest
    const text = words.join(' ')
    if (!panel || !text.trim()) throw new Error('Usage: stm send <panel> "text"')
    if (panel === 'new') throw new Error('From a panel, open one with: stm spawn --prompt "text"')
    return { cmd: 'psend', args: { ...id, panel, text } }
  }
  if (cmd === 'note') {
    const [op, name, ...words] = rest
    if (!['get', 'set', 'append'].includes(op) || !name) throw new Error('Usage: stm note get|set|append <name> [text]')
    if (op === 'append' && !words.length) throw new Error('Usage: stm note append <name> "text"')
    return { cmd: 'pnote', args: { ...id, op, name, ...(op === 'get' ? {} : { text: op === 'append' ? `${words.join(' ')}\n` : words.join(' ') }) } }
  }
  return null
}

/** The human output of a panel command. */
export function panelText(cmd, d) {
  if (cmd === 'whoami') return `${d.id}  ${d.name}\nproject ${d.project} (${d.cwd})\nmodel ${d.model ?? 'default'}`
  if (cmd === 'plinks') return d.length ? d.map((l) => `${l.panel}  ${l.name}${l.auto ? '  (auto-send)' : ''}`).join('\n') : 'No linked panels.'
  if (cmd === 'plink') return `Linked ${d.linked.join(' and ')}.`
  if (cmd === 'pspawn') return d.id
  if (cmd === 'psend') return d.delivery === 'auto' ? `Sent to ${d.panel} (auto-send is on for this link).` : `Queued in ${d.panel}'s composer; the person there sends it.`
  if (cmd === 'pnote') return d.text !== undefined ? d.text : `Saved ${d.name} (${d.size} bytes).`
  return JSON.stringify(d)
}
