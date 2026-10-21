/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CappedPercent } from './capped-percent'

afterEach(cleanup)

describe('CappedPercent', () => {
  it('shows the overrun as a separate muted note', () => {
    render(<CappedPercent value={105} overrun="budget" />)
    const note = screen.getByText('(+5%)')
    expect(note.className).toContain('text-muted-foreground')
    expect(note.className).toContain('text-xs')
    expect(note.parentElement?.textContent).toBe('100% (+5%)')
  })
  it('explains the overrun on hover and focus', () => {
    render(<CappedPercent value={108.11} overrun="budget" digits={2} />)
    const note = screen.getByText('(+8.11%)')
    fireEvent.mouseEnter(note)
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('The computed value is 108.11%')
    expect(tip.textContent).toContain('Approved expenses are higher than the planned budget.')
    expect(note.getAttribute('aria-describedby')).toBe(tip.id)
    fireEvent.mouseLeave(note)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(note)
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
  it('keeps the note out of the tab order inside another control', () => {
    render(<CappedPercent value={120} focusable={false} />)
    expect(screen.getByText('(+20%)').hasAttribute('tabindex')).toBe(false)
  })
  it('shows only the value at or under the limit', () => {
    const { container } = render(<CappedPercent value={62.5} overrun="budget" />)
    expect(container.textContent).toBe('62.5%')
  })
})
