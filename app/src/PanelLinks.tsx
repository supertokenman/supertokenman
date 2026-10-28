import { useEffect, useState } from 'react'
import type { PanelLinkView } from './bridge'
import { openContextMenu } from './ui/ContextMenu'
import { promptDialog } from './ui/dialog'

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
      links.flatMap((l) => [
        {
          label: `${l.name}: ${l.auto ? 'auto-send on (turn off)' : 'messages wait for you (turn auto-send on)'}`,
          onSelect: () => void window.stm.panelBus.setAuto(props.sid, l.panel, !l.auto).then((v) => setLinks(v[props.sid] ?? [])),
        },
        {
          label: `${l.name}: today ${spend(l)}${l.capUsd ? ` of $${l.capUsd.toFixed(2)}` : ''}, ${l.capUsd ? 'change the daily cap' : 'set a daily cap'}`,
          onSelect: () =>
            void promptDialog({ title: `Daily cap for the link with ${l.name}`, message: 'Turns started by messages over this link stop being accepted once they cost this much today. Empty or 0 removes the cap.', value: l.capUsd ? String(l.capUsd) : '', placeholder: '2.00' }).then((v) => {
              if (v === null) return
              void window.stm.panelBus.setCap(props.sid, l.panel, Number(v.replace(',', '.')) || 0).then((x) => setLinks(x[props.sid] ?? []))
            }),
        },
      ]),
    )
  return (
    <button className="persona-chip links-chip" onClick={menu} data-tip={`Linked to ${links.map((l) => `${l.name}${l.auto ? ' (auto)' : ''}: ${spend(l)} today`).join(', ')}. Click for auto-send and a daily cap per link.`}>
      linked: {links.map((l) => l.name).join(', ')}
    </button>
  )
}

const spend = (l: PanelLinkView) => `$${l.spent.usd.toFixed(2)}, ${l.spent.tokens.toLocaleString('en-US')} tokens, ${l.spent.turns} turn${l.spent.turns === 1 ? '' : 's'}`
