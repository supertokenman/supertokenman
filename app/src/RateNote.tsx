import { useMoney } from './currency'

/** Says how a converted total was converted (rate and date). Nothing when costs are in US dollars. */
export function RateNote() {
  const { note } = useMoney()
  return note ? <p className="faint rate-note" role="note">{note}</p> : null
}
