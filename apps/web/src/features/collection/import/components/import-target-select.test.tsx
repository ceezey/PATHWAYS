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
})
