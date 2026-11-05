/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicTrackerPreview } from './public-tracker-preview'

const projectId = '10000000-0000-4000-8000-000000000002'
const read = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))

const client = vi.hoisted(() => ({ contentBlob: vi.fn() }))

vi.mock('@/lib/api/publication', () => ({ publicationClient: {} }))
vi.mock('@/lib/api/public-media', () => ({ publicMediaClient: client }))
vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: () => read.result }))

describe('public tracker staff preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let n = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${++n}`), revokeObjectURL: vi.fn() })
  })
  afterEach(cleanup)

  it('renders the frozen snapshot of an unpublished revision with its review state', () => {
    read.result = {
      isPending: false,
      isError: false,
      data: {
        revision: 3,
        state: 'APPROVED',
        summary: 'Approved synthetic summary.',
        snapshot: {
          id: projectId,
          title: 'Synthetic preview project',
          code: 'SYN-02',
          approvedSummary: 'Approved synthetic summary.',
          area: null,
          sector: null,
          startDate: null,
          endDate: null,
          media: [],
          views: [],
        },
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    }
    render(<PublicTrackerPreview projectId={projectId} />)
    expect(screen.getByText('Approved, not public · Revision 3')).toBeTruthy()
    expect(screen.getByText('Not yet published')).toBeTruthy()
    expect(screen.getByText('Staff preview.')).toBeTruthy()
  })

  it('asks for a submitted summary when no publication row exists', () => {
    read.result = { isPending: false, isError: false, data: null }
    render(<PublicTrackerPreview projectId={projectId} />)
    expect(screen.getByText('No public summary yet')).toBeTruthy()
  })

  const photo = (n: number) => ({
    id: `20000000-0000-4000-8000-00000000000${n}`,
    type: 'PHOTO' as const,
    contentType: 'image/jpeg',
    caption: `Photo ${n}`,
  })
  const video = {
    ...photo(3),
    type: 'VIDEO' as const,
    contentType: 'video/mp4',
    caption: 'Video 3',
  }
  const withMedia = () => {
    const media = [photo(1), photo(2), video]
    read.result = {
      isPending: false,
      isError: false,
      data: {
        revision: 1,
        state: 'FOR_REVIEW',
        summary: 'Approved synthetic summary.',
        snapshot: {
          id: projectId,
          title: 'Synthetic preview project',
          code: 'SYN-02',
          approvedSummary: 'Approved synthetic summary.',
          area: null,
          sector: null,
          startDate: null,
          endDate: null,
          media,
          views: [],
        },
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    }
    return media
  }

  it('renders the page at once while photo downloads are pending', () => {
    withMedia()
    client.contentBlob.mockReturnValue(new Promise(() => {}))
    render(<PublicTrackerPreview projectId={projectId} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Synthetic preview project' }),
    ).toBeTruthy()
    expect(screen.getByText('Approved synthetic summary.')).toBeTruthy()
    expect(screen.getAllByText('Loading preview')).toHaveLength(2)
  })

  it('shows photos from authorized blobs and aborts and revokes them on unmount', async () => {
    withMedia()
    client.contentBlob.mockResolvedValue(new Blob(['x']))
    const { unmount } = render(<PublicTrackerPreview projectId={projectId} />)
    await waitFor(() => expect(screen.getByAltText('Photo 1').getAttribute('src')).toBe('blob:1'))
    expect(screen.getByAltText('Photo 2').getAttribute('src')).toBe('blob:2')
    const signal = client.contentBlob.mock.calls[0][2] as AbortSignal
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2')
  })

  it('shows a placeholder for a photo the viewer may not read and renders the rest', async () => {
    const media = withMedia()
    client.contentBlob.mockImplementation(async (_project: string, id: string) => {
      if (id === media[0].id) throw new Error('forbidden')
      return new Blob(['x'])
    })
    render(<PublicTrackerPreview projectId={projectId} />)
    await waitFor(() => expect(screen.getByText('Preview not available')).toBeTruthy())
    await waitFor(() => expect(screen.getByAltText('Photo 2')).toBeTruthy())
    expect(screen.queryByAltText('Photo 1')).toBeNull()
    expect(screen.getByText('Photo 1')).toBeTruthy()
  })

  it('fetches a video only after Load video preview is activated', async () => {
    withMedia()
    client.contentBlob.mockResolvedValue(new Blob(['x']))
    const { container } = render(<PublicTrackerPreview projectId={projectId} />)
    await waitFor(() => expect(screen.getByAltText('Photo 2')).toBeTruthy())
    expect(client.contentBlob).toHaveBeenCalledTimes(2)
    expect(client.contentBlob.mock.calls.some(([, id]) => id === video.id)).toBe(false)
    expect(container.querySelector('video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load video preview' }))
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy())
    expect(client.contentBlob.mock.calls.at(-1)?.[1]).toBe(video.id)
  })
})
