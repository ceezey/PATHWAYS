/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImportValueMapEditor, ruleToMappingInput } from './import-value-map-editor'

afterEach(cleanup)

// QAD-T54
describe('ImportValueMapEditor', () => {
  it('adds and edits a translation row for a column', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ImportValueMapEditor
        columnLabel="column 1"
        disabled={false}
        fieldType="SELECT"
        idPrefix="r"
        rule={{ dataType: '', pairs: [] }}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add translation' }))
    expect(onChange).toHaveBeenCalledWith({ dataType: '', pairs: [{ from: '', to: '' }] })

    rerender(
      <ImportValueMapEditor
        columnLabel="column 1"
        disabled={false}
        fieldType="SELECT"
        idPrefix="r"
        rule={{ dataType: '', pairs: [{ from: '', to: '' }] }}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Source value 1'), { target: { value: 'M' } })
    expect(onChange).toHaveBeenLastCalledWith({ dataType: '', pairs: [{ from: 'M', to: '' }] })
  })

  it('locks the controls when mapping is not editable', () => {
    render(
      <ImportValueMapEditor
        columnLabel="column 1"
        disabled
        fieldType="INTEGER"
        idPrefix="r"
        rule={{ dataType: '', pairs: [] }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add translation' })).toHaveProperty('disabled', true)
  })

  it('drops blank rows and a type that does not fit the target field', () => {
    const rule = {
      dataType: 'DATE' as const,
      pairs: [
        { from: 'M', to: 'Male' },
        { from: ' ', to: 'x' },
      ],
    }
    expect(ruleToMappingInput(rule, 'SELECT')).toEqual({ valueMap: [{ from: 'M', to: 'Male' }] })
    expect(ruleToMappingInput({ ...rule, dataType: 'TEXT' }, 'SELECT')).toMatchObject({
      dataType: 'TEXT',
    })
  })
})
