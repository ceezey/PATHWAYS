/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PreviewFrame } from './public-tracker-preview'

const projectId = '10000000-0000-4000-8000-000000000002'
const client = vi.hoisted(() => ({ contentBlob: vi.fn() }))

vi.mock('@/lib/api/public-media', () => ({ publicMediaClient: client }))

const photo = (n: number) => ({
  id: `20000000-0000-4000-8000-00000000000${n}`,
  type: 'PHOTO' as const,
  contentType: 'image/jpeg',
  caption: `Photo ${n}`,
})
const video = { ...photo(3), type: 'VIDEO' as const, contentType: 'video/mp4', caption: 'Video 3' }
const project = (media = [photo(1), photo(2), video], views: Array<'kpi' | 'timeline'> = []) => ({
  id: projectId,
  title: 'Synthetic preview project',
  code: 'SYN-02',
  approvedSummary: 'Approved synthetic summary.',
  area: null,
  sector: null,
  startDate: null,
  endDate: null,
  media,
  views,
})
const frame = (value = project()) => (
  <PreviewFrame project={value} state="For review · Revision 1" />
)

describe('staff preview frame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let n = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${++n}`), revokeObjectURL: vi.fn() })
  })
  afterEach(cleanup)

  it('renders the snapshot with its review state and an unpublished date', () => {
    render(frame(project([])))
    expect(screen.getByText('For review · Revision 1')).toBeTruthy()
    expect(screen.getByText('Not yet published')).toBeTruthy()
    expect(screen.getByText('Staff preview.')).toBeTruthy()
  })

  it('shows a placeholder instead of fetching each chosen live view', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(frame(project([], ['kpi', 'timeline'])))
    expect(screen.getAllByText('Live chart appears here once published')).toHaveLength(2)
    expect(fetcher).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('renders the page at once while photo downloads are pending', () => {
    client.contentBlob.mockReturnValue(new Promise(() => {}))
    render(frame())
    expect(
      screen.getByRole('heading', { level: 1, name: 'Synthetic preview project' }),
    ).toBeTruthy()
    expect(screen.getByText('Approved synthetic summary.')).toBeTruthy()
    expect(screen.getAllByText('Loading preview')).toHaveLength(2)
  })

  it('shows photos from authorized blobs and aborts and revokes them on unmount', async () => {
    client.contentBlob.mockResolvedValue(new Blob(['x']))
    const { unmount } = render(frame())
    await waitFor(() => expect(screen.getByAltText('Photo 1').getAttribute('src')).toBe('blob:1'))
    expect(screen.getByAltText('Photo 2').getAttribute('src')).toBe('blob:2')
    const signal = client.contentBlob.mock.calls[0][2] as AbortSignal
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2')
  })

  it('does not reload photos when rerendered with an equal media list', async () => {
    client.contentBlob.mockResolvedValue(new Blob(['x']))
    const view = render(frame())
    await waitFor(() => expect(screen.getByAltText('Photo 2')).toBeTruthy())
    view.rerender(frame(project([photo(1), photo(2), video].map((item) => ({ ...item })))))
    expect(client.contentBlob).toHaveBeenCalledTimes(2)
  })

  it('shows a placeholder for a photo the viewer may not read and renders the rest', async () => {
    client.contentBlob.mockImplementation(async (_project: string, id: string) => {
      if (id === photo(1).id) throw new Error('forbidden')
      return new Blob(['x'])
    })
    render(frame())
    await waitFor(() => expect(screen.getByText('Preview not available')).toBeTruthy())
    await waitFor(() => expect(screen.getByAltText('Photo 2')).toBeTruthy())
    expect(screen.queryByAltText('Photo 1')).toBeNull()
    expect(screen.getByText('Photo 1')).toBeTruthy()
  })

  it('fetches a video only after Load video preview is activated', async () => {
    client.contentBlob.mockResolvedValue(new Blob(['x']))
    const { container } = render(frame())
    await waitFor(() => expect(screen.getByAltText('Photo 2')).toBeTruthy())
    expect(client.contentBlob).toHaveBeenCalledTimes(2)
    expect(client.contentBlob.mock.calls.some(([, id]) => id === video.id)).toBe(false)
    expect(container.querySelector('video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load video preview' }))
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy())
    expect(client.contentBlob.mock.calls.at(-1)?.[1]).toBe(video.id)
  })
})
