/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProofPreviewDialog } from './proof-preview-dialog'

const artifact = (type: string) => ({ blob: new Blob(['x'], { type }), fileName: 'receipt-1.pdf' })
const setup = (load: () => Promise<ReturnType<typeof artifact>>, open = true) => {
  const save = vi.fn()
  const view = render(
    <ProofPreviewDialog load={load} onOpenChange={vi.fn()} open={open} save={save} title="Proof" />,
  )
  return { save, view }
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:proof')
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('ProofPreviewDialog', () => {
  it('renders an image for image types', async () => {
    setup(async () => artifact('image/png'))
    expect((await screen.findByRole('img', { name: 'Proof' })).getAttribute('src')).toBe(
      'blob:proof',
    )
  })

  it('renders an image for WebP', async () => {
    setup(async () => artifact('image/webp'))
    expect(await screen.findByRole('img', { name: 'Proof' })).toBeTruthy()
  })

  it('renders an iframe for PDFs', async () => {
    setup(async () => artifact('application/pdf'))
    expect((await screen.findByTitle('Proof')).tagName).toBe('IFRAME')
  })

  it('renders a video player for video types', async () => {
    setup(async () => artifact('video/mp4'))
    await waitFor(() => expect(document.querySelector('video[controls]')).not.toBeNull())
  })

  it.each(['image/svg+xml', 'image/gif', 'video/x-msvideo', 'text/html'])(
    'never renders %s',
    async (type) => {
      setup(async () => artifact(type))
      await screen.findByText('Preview not available for this file type.')
      expect(document.querySelector('img, iframe, video')).toBeNull()
    },
  )

  it('shows the unavailable state but keeps Download for other types', async () => {
    const { save } = setup(async () => artifact('application/zip'))
    await screen.findByText('Preview not available for this file type.')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('downloads the fetched blob without a second request', async () => {
    const load = vi.fn(async () => artifact('image/png'))
    const { save } = setup(load)
    await screen.findByRole('img')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(load).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'receipt-1.pdf' }))
  })

  it('revokes the object URL on close', async () => {
    const { view, save } = setup(async () => artifact('image/png'))
    await screen.findByRole('img')
    view.rerender(
      <ProofPreviewDialog
        load={async () => artifact('image/png')}
        onOpenChange={vi.fn()}
        open={false}
        save={save}
        title="Proof"
      />,
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:proof')
  })

  it('shows the error state when the fetch fails', async () => {
    setup(async () => {
      throw new Error('Artifact unavailable.')
    })
    expect(await screen.findByText('Preview unavailable')).toBeTruthy()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
