/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectSummary } from '@/types/pathways'
import { PublicDraftPreview } from './public-draft-preview'

const projectId = '10000000-0000-4000-8000-000000000002'
const read = vi.hoisted(() => ({ enabled: [] as boolean[], items: [] as unknown[] }))
const client = vi.hoisted(() => ({ contentBlob: vi.fn(), list: vi.fn() }))

vi.mock('@/lib/api/public-media', () => ({ publicMediaClient: client }))
vi.mock('@/hooks/use-permission', () => ({ usePermission: () => () => true }))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (_key: string, _id: string, _p: string, _f: unknown, enabled: boolean) => {
    read.enabled.push(enabled)
    return { data: enabled ? { items: read.items } : undefined }
  },
}))

const photo = (n: number) => ({
  id: `20000000-0000-4000-8000-00000000000${n}`,
  type: 'PHOTO' as const,
  contentType: 'image/jpeg',
  caption: `Photo ${n}`,
})
const project = {
  id: projectId,
  title: 'Synthetic draft project',
  code: 'SYN-03',
  area: 'Synthetic area',
  sector: 'Synthetic sector',
  startDate: '2026-01-01',
  endDate: null,
} as ProjectSummary
const current = {
  revision: 2,
  state: 'PUBLISHED' as const,
  summary: 'Submitted summary.',
  snapshot: {
    id: projectId,
    title: 'Submitted title',
    code: 'SYN-03',
    approvedSummary: 'Submitted summary.',
    area: null,
    sector: null,
    startDate: null,
    endDate: null,
    media: [photo(1)],
    views: ['kpi' as const],
  },
  submittedById: projectId,
  approvedById: null,
  publishedById: null,
  live: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Staff preview' }))

describe('public draft staff preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    read.enabled = []
    read.items = []
    client.contentBlob.mockReturnValue(new Promise(() => {}))
  })
  afterEach(cleanup)

  it('shows unsubmitted edits: summary, newly picked media in order, and views', () => {
    read.items = [{ ...photo(2), caption: undefined }]
    render(
      <PublicDraftPreview
        current={current}
        edited
        media={[
          { id: photo(2).id, caption: 'New caption 2' },
          { id: photo(1).id, caption: 'Edited caption 1' },
        ]}
        project={project}
        summary="Edited summary not yet submitted."
        views={['timeline', 'map']}
      />,
    )
    open()
    expect(screen.getByText('Edited summary not yet submitted.')).toBeTruthy()
    expect(screen.getByText('Unsaved changes · Not submitted')).toBeTruthy()
    expect(screen.getByText(/They are not saved until you submit the summary/)).toBeTruthy()
    const captions = screen.getAllByText(/caption \d/).map((node) => node.textContent)
    expect(captions).toEqual(['New caption 2', 'Edited caption 1'])
    expect(screen.getAllByText('Live chart appears here once published')).toHaveLength(2)
    expect(screen.getByText('Submitted title')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Back to Public Tracker/ })).toBeNull()
  })

  it('leaves out a picked item whose type is not known yet', () => {
    render(
      <PublicDraftPreview
        current={current}
        edited
        media={[{ id: photo(5).id, caption: 'Unknown item' }]}
        project={project}
        summary="Edited."
        views={[]}
      />,
    )
    open()
    expect(screen.queryByText('Unknown item')).toBeNull()
  })

  it('without edits shows the frozen revision and reads no media list', () => {
    render(
      <PublicDraftPreview
        current={current}
        edited={false}
        media={[{ id: photo(1).id, caption: 'Photo 1' }]}
        project={project}
        summary="Submitted summary."
        views={['kpi']}
      />,
    )
    open()
    expect(screen.getByText('Published · Revision 2')).toBeTruthy()
    expect(screen.getByText(/exact approved snapshot/)).toBeTruthy()
    expect(read.enabled.every((value) => !value)).toBe(true)
  })

  it('previews a never-submitted project from the project record', async () => {
    render(
      <PublicDraftPreview
        current={null}
        edited
        media={[]}
        project={project}
        summary="First summary."
        views={[]}
      />,
    )
    open()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'Synthetic draft project' }),
      ).toBeTruthy(),
    )
    expect(screen.getAllByText('Synthetic area').length).toBeGreaterThan(0)
    expect(screen.getByText('First summary.')).toBeTruthy()
  })
})
