import type { KeyboardEvent, MouseEvent } from 'react'

/**
 * Shared accessible pattern for a control that has no backend support yet.
 *
 * The control stays in the tab order and keeps its native focus/keyboard
 * behavior (native `disabled` removes an element from the tab order
 * entirely, which hides "Not available yet" from keyboard and
 * screen-reader users). Instead we mark it `aria-disabled="true"` and block
 * activation ourselves: a click or Enter/Space keypress is short-circuited
 * before it reaches the caller's own handler, and a `type="submit"` control
 * additionally never triggers its form's submit. A native `title` gives
 * mouse users a tooltip, and a visually hidden description linked via
 * `aria-describedby` gives the same explanation to assistive technology.
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

const blockActivation = (event: MouseEvent | KeyboardEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Props to spread onto a focusable control (button, Select item, etc.) so
 * it carries a consistent tooltip, an accessible description pointing at
 * an `UnavailableHint` rendered with the same `id`, and guards that block
 * activation while leaving the control reachable by keyboard and screen
 * readers.
 *
 * Spread this AFTER any real `onClick`/`onKeyDown` the caller defines so
 * the guard wins: an "unavailable" control must never run the real handler.
 */
export const unavailableControlProps = (hintId: string, message = UNAVAILABLE_HINT_MESSAGE) => ({
  'aria-describedby': hintId,
  'aria-disabled': true as const,
  title: message,
  onClick: (event: MouseEvent) => blockActivation(event),
  onKeyDown: (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      blockActivation(event)
    }
  },
  // Belt-and-suspenders for a `type="submit"` control: preventDefault on
  // click already stops the form submit the click would otherwise trigger,
  // but some hosts (e.g. `form.requestSubmit()` from elsewhere) don't route
  // through this element's click at all, so this only helps within the
  // click path itself. Kept explicit so intent isn't lost if the click
  // guard above is ever refactored away.
  onMouseDown: (event: MouseEvent) => blockActivation(event),
})
