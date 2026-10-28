import { useEffect, useState } from 'react'
import type { PanelLinkView } from './bridge'
import { openContextMenu } from './ui/ContextMenu'

/** The panels this one is linked to (through stm spawn or stm link), small in the panel header. A click
 * offers the link's "auto" switch: off by default, messages from the other panel wait in the composer. */
export function LinksChip(props: { sid: string }) {
  const [links, setLinks] = useState<PanelLinkView[]>([])
  useEffect(() => {
    let live = true
    void window.stm.panelBus.links().then((v) => live && setLinks(v[props.sid] ?? []))
    const off = window.stm.panelBus.onLinks((v) => setLinks(v[props.sid] ?? []))
    return () => ((live = false), off())
  }, [props.sid])
  if (!links.length) return null
  const menu = (e: React.MouseEvent) =>
    openContextMenu(
      e,
      links.map((l) => ({
        label: `${l.name}: ${l.auto ? 'auto-send on (turn off)' : 'messages wait for you (turn auto-send on)'}`,
        onSelect: () => void window.stm.panelBus.setAuto(props.sid, l.panel, !l.auto).then((v) => setLinks(v[props.sid] ?? [])),
      })),
    )
  return (
    <button className="persona-chip links-chip" onClick={menu} data-tip={`Linked to ${links.map((l) => `${l.name}${l.auto ? ' (auto)' : ''}`).join(', ')}. Click for auto-send per link.`}>
      linked: {links.map((l) => l.name).join(', ')}
    </button>
  )
}
