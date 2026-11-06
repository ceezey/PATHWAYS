/* @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ contentBlob: vi.fn() }))
vi.mock('@/lib/api/public-media', () => ({ publicMediaClient: client }))

import { PublicMediaThumb } from './public-media-thumb'

const projectId = '10000000-0000-4000-8000-000000000001'
const mediaId = '20000000-0000-4000-8000-000000000001'

// A controllable IntersectionObserver: the test decides when the element scrolls into view.
const observers: {
  callback: IntersectionObserverCallback
  disconnect: ReturnType<typeof vi.fn>
}[] = []
class FakeObserver {
  disconnect = vi.fn()
  constructor(callback: IntersectionObserverCallback) {
    observers.push({ callback, disconnect: this.disconnect })
  }
  observe() {}
  unobserve() {}
}
const intersect = () =>
  act(() => {
    for (const observer of observers)
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
  })

describe('public media thumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:thumb'), revokeObjectURL: vi.fn() })
    client.contentBlob.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    observers.length = 0
  })

  it('loads nothing until the photo scrolls into view, then loads it once', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    expect(screen.getByRole('img', { name: 'Loading preview: visit.jpg' })).toBeTruthy()
    expect(client.contentBlob).not.toHaveBeenCalled()
    intersect()
    expect(await screen.findByAltText('visit.jpg')).toBeTruthy()
    intersect()
    expect(client.contentBlob).toHaveBeenCalledTimes(1)
  })

  it('disconnects the observer on unmount and revokes a loaded object URL', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const view = render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    const [observer] = observers
    view.unmount()
    expect(observer.disconnect).toHaveBeenCalled()
    expect(client.contentBlob).not.toHaveBeenCalled()
  })

  it('revokes the object URL on unmount after an intersection', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const view = render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    intersect()
    await screen.findByAltText('visit.jpg')
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb')
  })

  it('never observes a video', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="VIDEO" label="clip.mp4" />,
    )
    expect(observers).toHaveLength(0)
  })

  it('shows a photo from an object URL and revokes it on unmount', async () => {
    const view = render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    const image = await screen.findByAltText('visit.jpg')
    expect(image.getAttribute('src')).toBe('blob:thumb')
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb')
  })

  it('does not download a video and keeps a labelled placeholder', () => {
    render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="VIDEO" label="clip.mp4" />,
    )
    expect(screen.getByRole('img', { name: 'Video: clip.mp4' })).toBeTruthy()
    expect(client.contentBlob).not.toHaveBeenCalled()
  })

  it('revokes nothing when the download resolves after unmount', async () => {
    let finish: (blob: Blob) => void = () => {}
    client.contentBlob.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve
      }),
    )
    const view = render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    view.unmount()
    finish(new Blob(['x']))
    await waitFor(() => expect(client.contentBlob).toHaveBeenCalled())
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('shows a placeholder when the download fails', async () => {
    client.contentBlob.mockRejectedValue(new Error('no'))
    render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    expect(await screen.findByRole('img', { name: 'Preview unavailable: visit.jpg' })).toBeTruthy()
  })
})
