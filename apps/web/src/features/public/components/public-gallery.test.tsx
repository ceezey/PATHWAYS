/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PublicGallery } from './public-gallery'

const items = [
  { id: 'a', type: 'PHOTO', caption: 'Opening day', src: 'blob:a' },
  { id: 'b', type: 'VIDEO', caption: 'Site walk', src: 'blob:b' },
  { id: 'c', type: 'PHOTO', caption: 'Group photo', src: 'blob:c' },
  { id: 'd', type: 'PHOTO', caption: 'Gone', src: '' },
] as const

describe('public gallery', () => {
  afterEach(cleanup)

  it('renders nothing without items', () => {
    const { container } = render(<PublicGallery items={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the first item large and the rest in a grid', () => {
    render(<PublicGallery items={[...items]} />)
    expect(screen.getByRole('heading', { name: 'Photos and videos' })).toBeTruthy()
    expect(screen.getByTestId('gallery-lead').querySelector('img')?.getAttribute('alt')).toBe(
      'Opening day',
    )
    expect(within(screen.getByTestId('gallery-grid')).getAllByRole('figure')).toHaveLength(3)
  })

  it('plays a video with controls, metadata preload and no autoplay', () => {
    const { container } = render(<PublicGallery items={[...items]} />)
    const video = container.querySelector('video')
    expect(video?.hasAttribute('controls')).toBe(true)
    expect(video?.getAttribute('preload')).toBe('metadata')
    expect(video?.hasAttribute('autoplay')).toBe(false)
  })

  it('gives every image its caption as alt text', () => {
    const { container } = render(<PublicGallery items={[...items]} />)
    expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('alt'))).toEqual([
      'Opening day',
      'Group photo',
    ])
  })

  it('opens the full-size item with its caption and closes on Escape', () => {
    render(<PublicGallery items={[...items]} />)
    fireEvent.click(screen.getByRole('button', { name: 'View full size: Group photo' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Group photo')).toBeTruthy()
    expect(within(dialog).getByRole('img', { name: 'Group photo' }).getAttribute('src')).toBe(
      'blob:c',
    )
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a neutral placeholder for an item without a source', () => {
    render(<PublicGallery items={[...items]} />)
    expect(screen.getByText('Preview not available')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View full size: Gone' })).toBeNull()
  })

  it('shows a given placeholder in place of the default', () => {
    render(<PublicGallery items={[{ ...items[3], placeholder: 'Loading preview' }]} />)
    expect(screen.getByText('Loading preview')).toBeTruthy()
    expect(screen.queryByText('Preview not available')).toBeNull()
  })
})
