/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SuggestedSeverity } from '../rules.utils'
import { SeverityField } from './severity-field'

afterEach(cleanup)

const none: SuggestedSeverity = {
  status: 'NEEDS_JUDGMENT',
  severity: null,
  reason: 'Pick yourself.',
}
const fields = (props: Partial<React.ComponentProps<typeof SeverityField>> = {}) => (
  <SeverityField
    mode="alert"
    onSeverity={vi.fn()}
    onUseSuggestion={vi.fn()}
    severity="LOW"
    suggestion={none}
    {...props}
  />
)

describe('SeverityField', () => {
  it.each([
    ['LOW', 'MEDIUM', /^Low/],
    ['MEDIUM', 'LOW', /^Medium/],
    ['HIGH', 'LOW', /^High/],
    ['CRITICAL', 'LOW', /^Critical/],
  ] as const)('reports %s when that severity is chosen', (value, current, name) => {
    const onSeverity = vi.fn()
    render(fields({ onSeverity, severity: current }))
    fireEvent.click(screen.getByRole('radio', { name }))
    expect(onSeverity).toHaveBeenCalledOnce()
    expect(onSeverity).toHaveBeenCalledWith(value)
  })
  it('checks only the current severity and does not report choosing it again', () => {
    const onSeverity = vi.fn()
    render(fields({ onSeverity, severity: 'HIGH' }))
    const checked = screen
      .getAllByRole('radio')
      .filter((radio) => (radio as HTMLInputElement).checked)
    expect(checked.map((radio) => (radio as HTMLInputElement).value)).toEqual(['HIGH'])
    fireEvent.click(screen.getByRole('radio', { name: /^High/ }))
    expect(onSeverity).not.toHaveBeenCalled()
  })
  it('offers a supported suggestion for use and keeps the button off when judgment is needed', () => {
    const onUseSuggestion = vi.fn()
    render(
      fields({
        onUseSuggestion,
        suggestion: { status: 'SUGGESTED', severity: 'HIGH', reason: 'Progress is far behind.' },
      }),
    )
    expect(screen.getByTestId('severity-suggestion').textContent).toBe('Suggested severity: High')
    expect(screen.getByText('Progress is far behind.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use suggestion' }))
    expect(onUseSuggestion).toHaveBeenCalledOnce()
    cleanup()
    render(fields())
    expect(screen.getByTestId('severity-suggestion').textContent).toBe('Needs your judgment')
    expect(
      (screen.getByRole('button', { name: 'Use suggestion' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
