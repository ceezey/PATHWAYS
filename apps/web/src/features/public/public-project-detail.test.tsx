import { mapPublicSnapshot } from '@/lib/services/public-projects'
/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PublicProjectDetail } from './public-project-detail'

vi.mock('./public-project-charts', () => ({
  PublicProgressTrendChart: () => <div data-testid="progress-chart" />,
  PublicIndicatorChart: () => <div data-testid="indicator-chart" />,
}))

describe('public project approved metric absence', () => {
  afterEach(cleanup)

  it('shows unavailable progress and indicators without inventing zero or mounting empty charts', () => {
    const project = mapPublicSnapshot({
      id: '10000000-0000-4000-8000-000000000001',
      title: 'Synthetic published project',
      code: 'SYN',
      approvedSummary: 'Approved synthetic summary.',
      area: null,
      sector: null,
      startDate: null,
      endDate: null,
      publishedAt: '2026-09-27T00:00:00.000Z',
    })
    project.publicPresentation.visibleSections = ['overview', 'progress', 'indicators']
    render(<PublicProjectDetail project={project} />)
    expect(screen.getByText('No approved progress is available.')).toBeTruthy()
    expect(screen.getByText('No approved indicators are available.')).toBeTruthy()
    expect(screen.queryByTestId('progress-chart')).toBeNull()
    expect(screen.queryByTestId('indicator-chart')).toBeNull()
    expect(screen.queryByText('0%')).toBeNull()
  })
})
