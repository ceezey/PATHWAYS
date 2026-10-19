/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SeverityPreview as Preview } from '../rule-severity.utils'
import { SeverityPreview } from './severity-preview'

afterEach(cleanup)

const open: Preview = {
  levels: ['LOW', 'MEDIUM', 'HIGH'],
  dependsOnDates: false,
  explanatoryOnly: false,
  needs: [],
  contradiction: null,
}
const view = (props: Partial<React.ComponentProps<typeof SeverityPreview>> = {}) =>
  render(
    <SeverityPreview
      critical={false}
      expectations={{}}
      onCritical={vi.fn()}
      onExpectations={vi.fn()}
      preview={open}
      showFollowUp={false}
      showScore={false}
      {...props}
    />,
  )
const headline = () => screen.getByTestId('severity-preview-levels').textContent

describe('SeverityPreview', () => {
  it('lists the possible levels in a live region and keeps the Critical sentence when narrowed', () => {
    view()
    expect(headline()).toBe('Possible levels: Low, Medium, or High. Critical is set manually.')
    expect(screen.getByTestId('severity-preview').getAttribute('aria-live')).toBe('polite')
    cleanup()
    view({ preview: { ...open, levels: ['MEDIUM', 'HIGH'] } })
    expect(headline()).toBe('Possible levels: Medium or High. Critical is set manually.')
    cleanup()
    view({ preview: { ...open, levels: ['HIGH'] } })
    expect(headline()).toBe('Possible levels: High. Critical is set manually.')
  })
  it('explains dates, explanatory-only rules, missing expectations and contradictions on the page', () => {
    view({ preview: { ...open, dependsOnDates: true, needs: ['MANAGEABLE_FOLLOW_UP_LEVEL'] } })
    expect(
      screen.getByText(
        'The level depends on planned dates and totals known only when the alert fires.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('We need the manageable follow-up level for this group.')).toBeTruthy()
    cleanup()
    view({
      preview: { ...open, levels: [], explanatoryOnly: true, needs: ['DELIVERY_EXPECTATION'] },
    })
    expect(headline()).toMatch(/no separate severity/)
    cleanup()
    view({ preview: { ...open, contradiction: 'These conditions cannot happen together.' } })
    expect(headline()).toBe('These conditions cannot happen together.')
  })
  it('marks Critical through a labelled keyboard-operable checkbox', () => {
    const onCritical = vi.fn()
    view({ onCritical })
    const box = screen.getByRole('checkbox', { name: 'Mark as Critical (manual judgment)' })
    expect((box as HTMLInputElement).checked).toBe(false)
    fireEvent.click(box)
    expect(onCritical).toHaveBeenCalledWith(true)
    cleanup()
    view({ critical: true })
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Mark as Critical (manual judgment)',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
  })
  it('shows each expectation field only when asked and links its error', () => {
    view()
    expect(screen.queryByLabelText('Expected score improvement')).toBeNull()
    expect(screen.queryByLabelText('Manageable follow-up level')).toBeNull()
    cleanup()
    const onExpectations = vi.fn()
    view({
      expectations: { manageableFollowUpPercent: '5' },
      onExpectations,
      showFollowUp: true,
      showScore: true,
    })
    fireEvent.change(screen.getByLabelText('Expected score improvement'), {
      target: { value: '10' },
    })
    expect(onExpectations).toHaveBeenCalledWith({
      manageableFollowUpPercent: '5',
      expectedScoreImprovement: '10',
    })
    cleanup()
    view({ expectations: { expectedScoreImprovement: '120' }, showScore: true })
    const input = screen.getByLabelText('Expected score improvement')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const error = screen.getByText('Use a value from 0 to 100.')
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
  })
})
