/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReportingPage } from './reporting-page'

const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjects: vi.fn(),
  getProjectIndicators: vi.fn(),
}))

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('./reporting-workspace', () => ({
  ReportingWorkspace: ({
    initialKind,
    indicators,
  }: { initialKind: string; indicators: unknown[] }) => (
    <div data-indicator-count={indicators.length}>Reporting {initialKind}</div>
  ),
}))

describe('reporting page dependencies', () => {
  it('loads project data without fetching Indicators for every report type', async () => {
    api.getProjects.mockResolvedValue([{ id: 'project-a' }])
    api.getProject.mockResolvedValue({ id: 'project-a', title: 'Project A' })

    render(await ReportingPage({ initialKind: 'project-summary' }))

    expect(screen.getByText('Reporting project-summary')).toBeTruthy()
    expect(api.getProject).toHaveBeenCalledWith('project-a')
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
  })
})
