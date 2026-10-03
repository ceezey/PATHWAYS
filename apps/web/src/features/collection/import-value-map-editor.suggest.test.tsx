/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type ColumnRuleDraft,
  ImportValueMapEditor,
  emptyColumnRule,
} from './import-value-map-editor'

const SEX = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED']

const renderEditor = (props: Partial<Parameters<typeof ImportValueMapEditor>[0]> = {}) => {
  const onChange = vi.fn<(next: ColumnRuleDraft) => void>()
  render(
    <ImportValueMapEditor
      allowedValues={SEX}
      columnLabel="column 13"
      disabled={false}
      fieldType="SELECT"
      idPrefix="rule"
      rule={emptyColumnRule}
      sourceValues={['A. Babae', 'B. Lalaki', 'Unknown']}
      onChange={onChange}
      {...props}
    />,
  )
  return onChange
}

describe('value map suggestions in the editor', () => {
  afterEach(cleanup)

  it('adds confident pairs for review and reports what still needs a choice', () => {
    const onChange = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest translations for column 13' }))
    expect(onChange).toHaveBeenCalledWith({
      dataType: '',
      pairs: [
        { from: 'A. Babae', to: 'FEMALE' },
        { from: 'B. Lalaki', to: 'MALE' },
      ],
    })
    expect(screen.getByText(/2 suggested from the loaded rows\. 1 need a translation/)).toBeTruthy()
  })

  it('offers no suggestions for free-text fields or columns without loaded values', () => {
    renderEditor({ fieldType: 'TEXT' })
    expect(screen.queryByRole('button', { name: /Suggest translations/ })).toBeNull()
    cleanup()
    renderEditor({ sourceValues: [] })
    expect(screen.queryByRole('button', { name: /Suggest translations/ })).toBeNull()
  })

  it('skips true and false for boolean fields because they are already accepted', () => {
    const onChange = renderEditor({
      allowedValues: null,
      fieldType: 'BOOLEAN',
      sourceValues: ['TRUE', 'FALSE', 'Oo', 'Hindi'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Suggest translations for column 13' }))
    expect(onChange.mock.calls[0]?.[0].pairs).toEqual([
      { from: 'Oo', to: 'true' },
      { from: 'Hindi', to: 'false' },
    ])
  })
})
