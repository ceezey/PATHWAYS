/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MetricTooltip, tooltipPosition } from './metric-tooltip'

afterEach(cleanup)

describe('MetricTooltip', () => {
  it('exposes metric context on hover, keyboard focus, and click', () => {
    render(
      <MetricTooltip label="Total spending">
        Verified spending against planned allocation.
      </MetricTooltip>,
    )

    const trigger = screen.getByRole('button', {
      name: 'More information about Total spending',
    })

    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Verified spending against planned allocation.',
    )
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(trigger)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.blur(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('keeps the tooltip inside the viewport at the right and bottom edges', () => {
    const tip = { width: 256, height: 80 }
    const viewport = { width: 1000, height: 600 }
    expect(tooltipPosition({ left: 100, top: 100, bottom: 120 }, tip, viewport)).toEqual({
      left: 100,
      top: 128,
    })
    expect(tooltipPosition({ left: 900, top: 100, bottom: 120 }, tip, viewport)).toEqual({
      left: 736,
      top: 128,
    })
    expect(tooltipPosition({ left: 100, top: 560, bottom: 580 }, tip, viewport)).toEqual({
      left: 100,
      top: 472,
    })
  })
})
