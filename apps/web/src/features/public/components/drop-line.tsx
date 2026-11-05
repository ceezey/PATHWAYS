// The guide line showing where a dragged item lands, drawn in the gap beside its relative parent.
export const DropLine = ({
  side,
  axis,
}: {
  side: 'before' | 'after' | null
  axis: 'horizontal' | 'vertical'
}) => {
  if (!side) return null
  const place =
    axis === 'horizontal'
      ? `inset-x-0 h-1 ${side === 'before' ? '-top-1.5' : '-bottom-1.5'}`
      : `inset-y-0 w-1 ${side === 'before' ? '-left-2.5' : '-right-2.5'}`
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 rounded-full bg-primary ${place}`}
      data-drop-line={side}
    />
  )
}
