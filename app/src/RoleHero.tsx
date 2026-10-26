/** A persona's face: its initial on a cut-corner tile tinted with its color. */
export function RoleHero(props: { p: { id: string; name: string; color: string }; size?: number }) {
  const size = props.size ?? 34
  const initial = (props.p.name.trim()[0] ?? '?').toUpperCase()
  return (
    <span className="role-hero" style={{ '--pc': props.p.color, width: size, height: size, fontSize: Math.round(size * 0.5) } as React.CSSProperties} aria-hidden="true">
      {initial}
    </span>
  )
}
