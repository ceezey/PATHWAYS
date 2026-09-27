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
vi.mock('./live-reporting-workspace', () => ({
  LiveReportingWorkspace: ({
    initialKind,
    previewOnly,
  }: { initialKind: string; previewOnly: boolean }) => (
    <div data-preview={String(previewOnly)}>Reporting {initialKind}</div>
  ),
}))
describe('reporting page purpose isolation', () => {
  it('delegates to the authorized aggregate workspace without broad project or indicator hydration', () => {
    render(<ReportingPage initialKind="project-summary" />)
    expect(screen.getByText('Reporting project-summary')).toBeTruthy()
    expect(api.getProjects).not.toHaveBeenCalled()
    expect(api.getProject).not.toHaveBeenCalled()
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
  })
  it('preserves preview-only routing', () => {
    render(<ReportingPage initialKind="survey-results" previewOnly />)
    expect(screen.getByText('Reporting survey-results').getAttribute('data-preview')).toBe('true')
  })
})
