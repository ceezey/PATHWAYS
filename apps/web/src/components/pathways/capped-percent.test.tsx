/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CappedPercent } from './capped-percent'

afterEach(cleanup)

describe('CappedPercent', () => {
  it('shows the overrun as a separate muted note', () => {
    render(<CappedPercent value={105} overLabel="over budget" />)
    const note = screen.getByText('(5% over budget)')
    expect(note.className).toContain('text-muted-foreground')
    expect(note.className).toContain('text-xs')
    expect(note.parentElement?.textContent).toBe('100% (5% over budget)')
  })
  it('shows only the value at or under the limit', () => {
    const { container } = render(<CappedPercent value={62.5} overLabel="over budget" />)
    expect(container.textContent).toBe('62.5%')
  })
})
