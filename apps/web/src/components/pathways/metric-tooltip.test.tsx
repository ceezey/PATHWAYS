/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

import { MetricTooltip, tooltipPosition } from './metric-tooltip'

afterEach(cleanup)

const renderTip = () => {
  render(
    <MetricTooltip label="Total spending">
      Verified spending against planned allocation.
    </MetricTooltip>,
  )
  return screen.getByRole('button', { name: 'More information about Total spending' })
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('MetricTooltip', () => {
  it('exposes metric context on hover, keyboard focus, and click', async () => {
    const trigger = renderTip()

    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Verified spending against planned allocation.',
    )
    fireEvent.mouseLeave(trigger)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())

    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.blur(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()

    fireEvent.click(trigger)
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })

  it('describes the trigger by the tooltip id and is not announced as a disclosure', () => {
    const trigger = renderTip()
    fireEvent.mouseEnter(trigger)
    expect(trigger.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id)
    expect(trigger.hasAttribute('aria-expanded')).toBe(false)
  })

  it('closes on Escape and keeps keyboard focus on the trigger', () => {
    const trigger = renderTip()
    trigger.focus()
    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes a hover-opened tooltip on Escape pressed anywhere', () => {
    const trigger = renderTip()
    fireEvent.mouseEnter(trigger)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('stays open while the pointer moves onto the tooltip', async () => {
    const trigger = renderTip()
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)
    const tip = screen.getByRole('tooltip')
    fireEvent.mouseEnter(tip)
    await pause(200)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.mouseLeave(tip)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('closes only the tooltip, not a surrounding sheet, on the first Escape', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet onOpenChange={onOpenChange} open>
        <SheetContent>
          <SheetTitle>Edit rule</SheetTitle>
          <SheetDescription>Rule details</SheetDescription>
          <MetricTooltip label="Activity scope">Activity delivery</MetricTooltip>
        </SheetContent>
      </Sheet>,
    )
    const trigger = screen.getByRole('button', { name: 'More information about Activity scope' })
    trigger.focus()
    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toBeTruthy()

    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    // With no tip open, Escape reaches the sheet as before.
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps a focus-opened tooltip when the pointer crosses the trigger and leaves', async () => {
    const trigger = renderTip()
    trigger.focus()
    fireEvent.focus(trigger)
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)
    await pause(200)
    expect(screen.getByRole('tooltip')).toBeTruthy()
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
