/* @vitest-environment jsdom */
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PublicView } from '@pathways/shared'
import { PublicViewPicker } from './public-view-picker'

const handle = (name: string) =>
  screen.getByRole('button', { name: (label) => label.startsWith(`Reorder ${name},`) })

const setup = (value: PublicView[], disabled = false) => {
  const onChange = vi.fn()
  render(<PublicViewPicker disabled={disabled} onChange={onChange} value={value} />)
  return onChange
}
const chosen = () =>
  within(screen.getByRole('list', { name: 'Chosen charts' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

describe('public view picker', () => {
  afterEach(cleanup)

  it('numbers the ticked charts in public order', () => {
    setup(['timeline', 'kpi'])
    expect(chosen()).toEqual(['1Timeline adherence', '2KPI / indicator performance'])
  })

  it('keeps focus on the moved handle and announces its new position', () => {
    const Stateful = () => {
      const [value, setValue] = useState<PublicView[]>(['kpi', 'saddd', 'map'])
      return <PublicViewPicker disabled={false} onChange={setValue} value={value} />
    }
    render(<Stateful />)
    const kpi = () => handle('KPI / indicator performance')
    kpi().focus()
    fireEvent.keyDown(kpi(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(kpi())
    expect(kpi().getAttribute('aria-label')).toBe(
      'Reorder KPI / indicator performance, position 2 of 3',
    )
    expect(screen.getByRole('status').textContent).toBe(
      'KPI / indicator performance moved to position 2 of 3',
    )
    fireEvent.keyDown(kpi(), { key: 'ArrowDown' })
    fireEvent.keyDown(kpi(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(kpi())
    expect(screen.getByRole('status').textContent).toBe(
      'KPI / indicator performance moved to position 3 of 3',
    )
  })

  it('cancels the browser drop so a dropped image cannot navigate away', () => {
    setup(['kpi', 'map'])
    const [first, last] = screen.getAllByRole('listitem')
    const dataTransfer = { setData: vi.fn(), effectAllowed: 'all' }
    fireEvent.dragStart(last, { dataTransfer })
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'map')
    expect(dataTransfer.effectAllowed).toBe('move')
    const drop = createEvent.drop(first)
    fireEvent(first, drop)
    expect(drop.defaultPrevented).toBe(true)
  })

  it('moves a chart with arrow keys on its handle and stops at the ends', () => {
    const onChange = setup(['kpi', 'saddd', 'map'])
    fireEvent.keyDown(handle('Project coverage map'), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith(['kpi', 'map', 'saddd'])
    fireEvent.keyDown(handle('KPI / indicator performance'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(['saddd', 'kpi', 'map'])
    onChange.mockClear()
    fireEvent.keyDown(handle('KPI / indicator performance'), { key: 'ArrowUp' })
    fireEvent.keyDown(handle('Project coverage map'), { key: 'ArrowDown' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('drops a dragged chart into the target place', () => {
    const onChange = setup(['kpi', 'saddd', 'map'])
    const [first, , last] = screen.getAllByRole('listitem')
    fireEvent.dragStart(last)
    fireEvent.drop(first)
    expect(onChange).toHaveBeenLastCalledWith(['map', 'kpi', 'saddd'])
  })

  it('draws a guide line where the dragged chart will land', () => {
    setup(['kpi', 'saddd', 'map'])
    const [first, middle, last] = screen.getAllByRole('listitem')
    const line = (item: HTMLElement) =>
      item.querySelector('[data-drop-line]')?.getAttribute('data-drop-line') ?? null
    fireEvent.dragStart(last)
    fireEvent.dragOver(last)
    expect(line(last)).toBeNull()
    fireEvent.dragOver(first)
    expect(line(first)).toBe('before')
    fireEvent.drop(first)
    expect(document.querySelector('[data-drop-line]')).toBeNull()
    fireEvent.dragStart(first)
    fireEvent.dragOver(middle)
    expect(line(middle)).toBe('after')
    fireEvent.dragEnd(first)
    expect(document.querySelector('[data-drop-line]')).toBeNull()
  })

  it('ignores drag while disabled', () => {
    const onChange = setup(['kpi', 'map'], true)
    const [first, last] = screen.getAllByRole('listitem')
    expect(first.getAttribute('draggable')).toBe('false')
    fireEvent.dragStart(last)
    fireEvent.drop(first)
    expect(onChange).not.toHaveBeenCalled()
  })
})
