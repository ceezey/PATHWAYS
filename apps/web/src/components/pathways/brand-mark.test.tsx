/* @vitest-environment jsdom */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BrandMark, PATHWAYS_MARK_SIZE, PATHWAYS_MARK_SOURCE } from './brand-mark'

describe('BrandMark', () => {
  it('renders the approved mark as a decorative, square image', () => {
    const { container } = render(<BrandMark />)
    const image = container.querySelector('img')

    expect(image).not.toBeNull()
    expect(image?.getAttribute('alt')).toBe('')
    expect(image?.getAttribute('aria-hidden')).toBe('true')
    expect(PATHWAYS_MARK_SOURCE).toBe('/brand/pathways-mark.png')
    expect(image?.getAttribute('src')).toContain('pathways-mark.png')
    expect(image?.getAttribute('width')).toBe(String(PATHWAYS_MARK_SIZE))
    expect(image?.getAttribute('height')).toBe(String(PATHWAYS_MARK_SIZE))
  })
})
