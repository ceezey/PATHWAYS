/**
 * Shared accessible pattern for a control that has no backend support yet.
 *
 * The control stays disabled (so it cannot be activated), a native `title`
 * gives mouse users a tooltip, and a visually hidden description linked via
 * `aria-describedby` gives the same "Not available yet" explanation to
 * assistive technology inspecting the control.
 */
export const UNAVAILABLE_HINT_MESSAGE = 'Not available yet'

export const UnavailableHint = ({
  id,
  message = UNAVAILABLE_HINT_MESSAGE,
}: {
  id: string
  message?: string
}) => (
  <span className="sr-only" id={id}>
    {message}
  </span>
)

/**
 * Props to spread onto a disabled control so it carries a consistent
 * tooltip and an accessible description pointing at an `UnavailableHint`
 * rendered with the same `id`.
 */
export const unavailableControlProps = (hintId: string, message = UNAVAILABLE_HINT_MESSAGE) => ({
  'aria-describedby': hintId,
  disabled: true as const,
  title: message,
})
