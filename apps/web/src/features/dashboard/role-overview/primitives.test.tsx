/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AccentKpi, DashboardHeading, ListCard, ListRow } from './primitives'

describe('dashboard primitives', () => {
  afterEach(cleanup)

  it('renders the greeting heading and subtitle', () => {
    render(<DashboardHeading fullName="Ron Perez" title="Your workspace" subtitle="Oct 4, 2026" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /^Good (morning|afternoon|evening), Ron\.$/,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Your workspace' })).toBeTruthy()
  })

  it('renders a KPI with an action link', () => {
    render(
      <AccentKpi
        label="Overdue"
        value="1"
        sub="ACT-001 · 14 days"
        tone="danger"
        action={{ label: 'View', href: '/projects' }}
      />,
    )
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View' }).getAttribute('href')).toBe('/projects')
  })

  it('shows the empty text when a list has no rows and opens a row', () => {
    const open = vi.fn()
    const { rerender } = render(
      <ListCard title="Your activities" empty="Nothing assigned.">
        {[]}
      </ListCard>,
    )
    expect(screen.getByText('Nothing assigned.')).toBeTruthy()
    rerender(
      <ListCard title="Your activities" empty="Nothing assigned.">
        <ListRow title="Training" meta="P · Due Oct 9" onOpen={open} />
      </ListCard>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Training/ }))
    expect(open).toHaveBeenCalled()
  })
})
