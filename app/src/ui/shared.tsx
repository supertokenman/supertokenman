import { Children, isValidElement, type ReactNode } from 'react'

/** What a control's onChange receives: the shape of a native change event that handlers read. */
export type ValueEvent = {
  target: { value: string; id?: string; name?: string }
  currentTarget: { value: string; id?: string; name?: string }
}
export const valueEvent = (value: string, el: { id?: string; name?: string } = {}): ValueEvent => {
  const t = { value, id: el.id, name: el.name }
  return { target: t, currentTarget: t }
}

/** The plain words of a React node, for type-to-jump and accessible names. */
export function textOf(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children)
  return Children.toArray(n).map(textOf).join('')
}

export const Check = () => (
  <svg className="mm-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
export const Chevron = () => (
  <svg className="mm-chev" width="8" height="10" viewBox="0 0 8 10" aria-hidden="true"><path d="M2.5 1.5L6 5 2.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
