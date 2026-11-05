/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportTargetSelect } from './import-target-select'

// jsdom lacks the layout APIs Radix Select calls when it opens.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false

const fields = [
  { code: 'sex', label: 'Sex' },
  { code: 'last_name', label: 'Last name' },
  { code: 'beneficiary_code', label: 'Beneficiary code' },
]
afterEach(cleanup)

function open(value = '__pending__') {
  render(
    <ImportTargetSelect
      id="target"
      label="Target"
      fields={fields}
      value={value}
      disabled={false}
      onChange={() => {}}
    />,
  )
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target' }), { key: 'Enter' })
}
const options = () => screen.getAllByRole('option').map((option) => option.textContent)

describe('import target select', () => {
  it('lists fields alphabetically after the pinned pending and ignore choices', () => {
    open()
    expect(options()).toEqual([
      'Pending: select a target or explicit ignore',
      'Ignore this source column',
      'Beneficiary code (beneficiary_code)',
      'Last name (last_name)',
      'Sex (sex)',
    ])
  })

  it('filters by label or code and keeps the chosen field listed', () => {
    open('sex')
    fireEvent.change(screen.getByLabelText('Search fields'), { target: { value: 'NAME' } })
    expect(options()).toEqual([
      'Pending: select a target or explicit ignore',
      'Ignore this source column',
      'Last name (last_name)',
      'Sex (sex)',
    ])
    fireEvent.change(screen.getByLabelText('Search fields'), { target: { value: 'beneficiary_' } })
    expect(options()).toContain('Beneficiary code (beneficiary_code)')
  })

  it('sends a letter typed on a list item to the search box', () => {
    open()
    const item = screen.getAllByRole('option')[0]
    item.focus()
    fireEvent.keyDown(item, { key: 'l' })
    const search = screen.getByLabelText('Search fields') as HTMLInputElement
    expect(document.activeElement).toBe(search)
    expect(search.value).toBe('l')
    expect(options()).toContain('Last name (last_name)')
    expect(options()).not.toContain('Sex (sex)')
  })

  it('moves from the first item up into the search box', () => {
    open()
    const first = screen.getAllByRole('option')[0]
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByLabelText('Search fields'))
  })

  it('says when a search matches nothing but the chosen field', () => {
    open('sex')
    fireEvent.change(screen.getByLabelText('Search fields'), { target: { value: 'zzz' } })
    expect(screen.getByRole('status').textContent).toBe('No matching fields.')
  })
})
