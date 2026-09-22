/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MetricTooltip } from './metric-tooltip'

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
})
