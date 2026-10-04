/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readPublicSnapshots } from '@/lib/services/public-projects'
import { PublicTrackerDetail, PublicTrackerHome } from './public-tracker-view'

const snapshot = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Synthetic published project',
  code: 'SYN-01',
  approvedSummary: 'Approved synthetic summary.',
  area: 'Synthetic area',
  sector: 'Synthetic sector',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  publishedAt: '2026-09-27T00:00:00.000Z',
}

describe('public tracker view', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows the allowlisted fields and no internal metrics or donation call', () => {
    render(<PublicTrackerDetail project={snapshot} />)
    expect(screen.getByRole('heading', { level: 1, name: snapshot.title })).toBeTruthy()
    expect(screen.getByText(snapshot.approvedSummary)).toBeTruthy()
    expect(screen.getAllByText('2026-01-01 to 2026-12-31').length).toBeGreaterThan(0)
    expect(screen.getByText('2026-09-27')).toBeTruthy()
    for (const hidden of [/beneficiar/i, /budget/i, /assessment/i, /donate/i, /progress/i])
      expect(screen.queryByText(hidden)).toBeNull()
  })

  it('labels a staff preview distinctly from the published view', () => {
    render(<PublicTrackerDetail project={snapshot} state="For review · Revision 2" />)
    expect(screen.getByText('Staff preview.')).toBeTruthy()
    expect(screen.getByText('For review · Revision 2')).toBeTruthy()
    expect(screen.queryByText('Approved public view.')).toBeNull()
  })

  it('shows the no current projects message when nothing is published', () => {
    render(<PublicTrackerHome projects={[]} />)
    expect(screen.getByText('No current projects')).toBeTruthy()
  })

  it('rejects a public response carrying a field outside the allowlist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ ...snapshot, budget: 1 }]))),
    )
    await expect(readPublicSnapshots()).rejects.toThrow()
  })
})
