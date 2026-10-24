/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImportDateOrder } from './import-date-order'
import { ruleToMappingInput } from './import-value-map-editor'

const renderOrder = (values: string[], value: '' | 'YMD' = '') =>
  render(
    <ImportDateOrder
      columnLabel="column 2"
      disabled={false}
      idPrefix="rule"
      referenceYear={2026}
      value={value}
      values={values}
      onChange={vi.fn()}
    />,
  )

describe('import date order', () => {
  afterEach(cleanup)

  it('only notes the order when one reads every date', () => {
    renderOrder(['15/03/2026', '01/02/2026'])
    expect(screen.getByText('Dates in column 2 are read as day, month, year.')).toBeTruthy()
    expect(screen.queryByLabelText('Date format for column 2')).toBeNull()
  })

  it('asks for a format when several orders read every date', () => {
    renderOrder(['26/03/15', '26/05/31'])
    expect(screen.getByLabelText('Date format for column 2')).toBeTruthy()
    expect(screen.getByText(/can be read more than one way/)).toBeTruthy()
  })

  it('shows nothing for ISO dates', () => {
    const { container } = renderOrder(['2026-03-15'])
    expect(container.textContent).toBe('')
  })

  it('sends a chosen order only for a date column', () => {
    const rule = { dataType: '' as const, pairs: [], dateOrder: 'YMD' as const }
    expect(ruleToMappingInput(rule, 'DATE')).toEqual({ dateOrder: 'YMD' })
    expect(ruleToMappingInput(rule, 'TEXT')).toEqual({})
  })
})
