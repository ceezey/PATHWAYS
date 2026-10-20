/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SeverityPreview as Preview } from '../rule-severity.utils'
import type { Leaf } from '../rules.utils'
import { SeverityPreview } from './severity-preview'

afterEach(cleanup)

const open: Preview = {
  levels: ['LOW', 'MEDIUM', 'HIGH'],
  dependsOnDates: false,
  explanatoryOnly: false,
  needs: [],
  contradiction: null,
}
const leaf = (id: string, metric: string, operator: string, threshold: string) =>
  ({ kind: 'CONDITION', id, metric, operator, threshold }) as Leaf
const view = (props: Partial<React.ComponentProps<typeof SeverityPreview>> = {}) =>
  render(
    <SeverityPreview
      conditions={[]}
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
    expect(headline()).toBe('Possible levels: Low, Medium, or High.')
    expect(screen.getByTestId('severity-preview').getAttribute('aria-live')).toBe('polite')
    expect(screen.getByTestId('severity-preview').querySelector('details')).toBeNull()
    cleanup()
    view({ preview: { ...open, levels: ['MEDIUM', 'HIGH'] } })
    expect(headline()).toBe('Possible levels: Medium or High.')
    cleanup()
    view({ preview: { ...open, levels: ['HIGH'] } })
    expect(headline()).toBe('Possible levels: High.')
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
      conditions: [leaf('c1', 'PROJECT_TIMELINE_ELAPSED_PERCENT', 'LT', '90')],
      preview: { ...open, levels: [], explanatoryOnly: true, needs: ['DELIVERY_EXPECTATION'] },
    })
    expect(headline()).toBe('This alert will say Needs context instead of Low, Medium or High.')
    expect(screen.getByTestId('severity-preview').querySelector('details')).toBeTruthy()
    expect(
      screen.getByText(
        'Project timeline elapsed measures time, not work done, so it never gets a level.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('How can I get a level?').closest('details')?.open).toBe(false)
    expect(screen.getByText(/add Activities completed in step 2/)).toBeTruthy()
    expect(screen.getByTestId('severity-preview').textContent).not.toMatch(/budget/i)
    cleanup()
    view({
      conditions: [leaf('c1', 'PROJECT_REMAINING_DAYS', 'EQ', '10')],
      preview: { ...open, levels: [], explanatoryOnly: true, needs: ['DELIVERY_EXPECTATION'] },
    })
    expect(
      screen.getByText('Days until project end only gets a level after the end date has passed.'),
    ).toBeTruthy()
    expect(screen.getByText(/use a value below 0/)).toBeTruthy()
    expect(screen.queryByText(/Activities completed/)).toBeNull()
    expect(screen.queryByTestId('severity-explanations')).toBeNull()
    cleanup()
    view({
      conditions: [leaf('c1', 'BUDGET_UTILIZATION_PERCENT', 'GT', '95')],
      preview: { ...open, levels: ['MEDIUM', 'HIGH'], needs: ['DELIVERY_EXPECTATION'] },
    })
    expect(
      screen.getByText('Budget used only gets a level above 100%, when spending goes over budget.'),
    ).toBeTruthy()
    cleanup()
    view({ preview: { ...open, contradiction: 'These conditions cannot happen together.' } })
    expect(headline()).toBe('These conditions cannot happen together.')
  })
  it('toggles Critical through the one keyboard-operable tile', () => {
    const onCritical = vi.fn()
    view({ onCritical })
    const tile = screen.getByRole('button', { name: /^Critical/ })
    expect(tile.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(tile)
    expect(onCritical).toHaveBeenCalledWith(true)
    cleanup()
    view({ critical: true, onCritical })
    const pressed = screen.getByRole('button', { name: /^Critical/ })
    expect(pressed.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pressed)
    expect(onCritical).toHaveBeenLastCalledWith(false)
    expect(screen.getByText('Critical is set manually and is not suggested here.')).toBeTruthy()
  })
  it('lights only the possible Low, Medium and High tiles and never makes them clickable', () => {
    const lit = (level: string) =>
      screen.getByTestId(`severity-tile-${level}`).getAttribute('data-lit')
    view({ preview: { ...open, levels: ['MEDIUM', 'HIGH'] } })
    expect([lit('LOW'), lit('MEDIUM'), lit('HIGH')]).toEqual(['false', 'true', 'true'])
    expect(screen.getByTestId('severity-tile-LOW').getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByRole('button', { name: /^(Low|Medium|High)/ })).toBeNull()
    cleanup()
    view({ preview: { ...open, levels: [], explanatoryOnly: true } })
    expect(lit('HIGH')).toBe('false')
  })
  it('explains per condition how the level is raised, with the combination notes', () => {
    view({
      conditions: [
        leaf('a', 'PROJECT_OVERDUE_DAYS', 'GT', '10'),
        leaf('b', 'BUDGET_UTILIZATION_PERCENT', 'GT', '95'),
        leaf('c', 'ACTIVITY_COMPLETION_PERCENT', 'LT', '50'),
      ],
    })
    const box = screen.getByTestId('severity-explanations').textContent ?? ''
    expect(box).toContain('Days past project end is above 10 days:')
    expect(box).toContain('Low up to 5%, Medium up to 10%, High above 10%')
    expect(box).toContain('above 100% up to 110% is Medium')
    expect(box).toContain('When several conditions match, the highest level wins.')
    expect(box).toContain('combined signal')
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
