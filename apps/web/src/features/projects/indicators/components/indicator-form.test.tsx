// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewIndicator } from './indicator-form'

vi.mock('@/components/ui/select', async () =>
  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),
)

afterEach(cleanup)

const open = () => {
  const onSave = vi.fn().mockResolvedValue(true)
  render(
    <NewIndicator
      forms={[]}
      activities={[]}
      period={{ periodStart: '2026-01-01', periodEnd: '2026-12-31' }}
      existingCodes={[]}
      existingNames={[]}
      busy={false}
      message={null}
      onSave={onSave}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add project indicator' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Training attendance' } })
  return onSave
}

const fillManual = (measuredAs?: string) => {
  fireEvent.change(screen.getByLabelText('Calculation'), { target: { value: 'MANUAL' } })
  if (measuredAs)
    fireEvent.change(screen.getByLabelText('Measured as'), { target: { value: measuredAs } })
  fireEvent.change(screen.getByLabelText('Unit label'), { target: { value: 'people' } })
  fireEvent.change(screen.getByLabelText('Target'), { target: { value: '100' } })
  fireEvent.change(screen.getByLabelText('Source description'), {
    target: { value: 'Attendance sheet' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save indicator' }))
}

describe('IndicatorForm measurement type', () => {
  it('saves a manual count without a binding', async () => {
    const onSave = open()
    fireEvent.change(screen.getByLabelText('Calculation'), { target: { value: 'MANUAL' } })
    expect(screen.queryByLabelText('Recipe')).toBeNull()
    fillManual()
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      mode: 'MANUAL',
      numericKind: 'COUNT',
      displayPrecision: 0,
      unitLabel: 'people',
      target: '100',
      baseline: '0',
      dataSource: 'Attendance sheet',
      code: 'TA-01',
    })
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('binding')
  })

  it('saves a manual percentage with two decimals', async () => {
    const onSave = open()
    fireEvent.change(screen.getByLabelText('Calculation'), { target: { value: 'MANUAL' } })
    fillManual('PERCENTAGE')
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      mode: 'MANUAL',
      numericKind: 'PERCENTAGE',
      displayPrecision: 2,
    })
  })

  it('keeps the derived form by default', async () => {
    const onSave = open()
    expect(screen.queryByLabelText('Unit label')).toBeNull()
    expect(screen.queryByLabelText('Measured as')).toBeNull()
    fireEvent.change(screen.getByLabelText('Source description'), {
      target: { value: 'Activity records' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save indicator' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0]).toMatchObject({ mode: 'DERIVED' })
    expect(onSave.mock.calls[0][0].binding.recipe).toBe('ACTIVITY_COMPLETION_PERCENTAGE')
  })
})
