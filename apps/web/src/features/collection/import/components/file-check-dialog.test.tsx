/* @vitest-environment jsdom */
import type { FileCheckReport } from '@pathways/imports'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FileCheckDialog } from './file-check-dialog'

const report: FileCheckReport = {
  totalRows: 100,
  problemRows: 95,
  problems: [
    {
      kind: 'ROW',
      fieldCode: 'birth_date',
      fieldLabel: 'Birth date',
      columnHeader: 'Date of Birth',
      columnLetter: 'N',
      code: 'AGE_MISMATCH',
      message: 'The age does not match the birth date.',
      rowCount: 82,
      exampleRows: [4, 9, 12],
      date: {
        example: { row: 4, shown: '08/17/08', read: '2008-08-17' },
        preferred: 'YYYY-MM-DD, for example 2008-08-17',
        fix: 'In Excel or Google Sheets, select the column and set its format to yyyy-mm-dd, or retype the dates in that order if they are wrong.',
        evidence: { reading: 'TYPED_YY_MM_DD', agreeing: 80, of: 82 },
      },
    },
    {
      kind: 'NO_COLUMN',
      fieldCode: 'enrolled',
      fieldLabel: 'Enrollment date',
      columnHeader: null,
      columnLetter: null,
      code: 'NO_COLUMN',
      message:
        'No column matches. Rename the column, or add its header as a source name under Advanced Configuration.',
      // Every row of the file lacks the value.
      rowCount: 100,
      exampleRows: [],
    },
    ...['S-12', 'S-30'].map((id, index) => ({
      kind: 'ROW' as const,
      fieldCode: 'external_identifier_value',
      fieldLabel: 'Student ID',
      columnHeader: 'Student ID',
      columnLetter: 'A',
      code: 'IDENTITY_CONFLICT',
      message: `Student ID ${id} is on rows ${4 + index} and ${19 + index}`,
      rowCount: 2,
      exampleRows: [4 + index, 19 + index],
    })),
  ],
}

const open = (handlers = {}) => {
  const fileInput = createRef<HTMLInputElement>()
  const props = { onFix: vi.fn(), onUploadAnyway: vi.fn(), onClose: vi.fn(), ...handlers }
  render(
    <>
      <input aria-label="file" ref={fileInput} />
      <FileCheckDialog report={report} fileInput={fileInput} {...props} />
    </>,
  )
  return props
}

describe('FileCheckDialog', () => {
  afterEach(cleanup)

  it('shows the note, the problems and the date help', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Check your file before uploading' })
    expect(
      within(dialog).getByText(
        '95 of 100 rows have problems you can fix in the file. Fixing them in your spreadsheet first makes the upload go smoothly. Uploaded as it is, each of these rows has to be reviewed here one by one.',
      ),
    ).toBeTruthy()
    const table = within(dialog).getByRole('table')
    expect(within(table).getByText('Date of Birth (N)')).toBeTruthy()
    const noColumn = within(table).getByText('Enrollment date').closest('tr') as HTMLElement
    expect(
      within(noColumn)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual([
      'Enrollment date',
      'No column matches. Rename the column, or add its header as a source name under Advanced Configuration.',
      '100',
    ])
    expect(within(table).getByText('Rows 4, 9, 12')).toBeTruthy()
    // Each duplicated value is its own line.
    expect(within(table).getByText('Student ID S-12 is on rows 4 and 19')).toBeTruthy()
    expect(within(table).getByText('Student ID S-30 is on rows 5 and 20')).toBeTruthy()
    expect(within(table).getByText('Read as: 08/17/08 was read as 2008-08-17')).toBeTruthy()
    expect(within(table).getByText("80 of 82 rows' ages match when read as YY/MM/DD")).toBeTruthy()
    expect(
      within(table).getByText('Preferred format: YYYY-MM-DD, for example 2008-08-17'),
    ).toBeTruthy()
    expect(within(table).getByText(/set its format to yyyy-mm-dd/)).toBeTruthy()
  })

  it('words a day and month swap and an unshown cell', () => {
    const fileInput = createRef<HTMLInputElement>()
    const date = report.problems[0].date
    if (!date) throw new Error('fixture')
    const dialog = (shown: string | null) => (
      <FileCheckDialog
        report={{
          ...report,
          problems: [
            {
              ...report.problems[0],
              date: {
                ...date,
                example: { row: 4, shown, read: '2008-08-17' },
                evidence: { reading: 'DAY_MONTH_SWAPPED', agreeing: 9, of: 10 },
              },
            },
          ],
        }}
        fileInput={fileInput}
        onFix={vi.fn()}
        onUploadAnyway={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const { rerender } = render(dialog(null))
    expect(screen.getByText('Read as: 2008-08-17')).toBeTruthy()
    expect(screen.getByText("9 of 10 rows' ages match with day and month swapped")).toBeTruthy()
    // A text date already typed as YYYY-MM-DD is not repeated.
    rerender(dialog('2008-08-17'))
    expect(screen.getByText('Read as: 2008-08-17')).toBeTruthy()
  })

  it('words the note and the column when no row has a problem', () => {
    const fileInput = createRef<HTMLInputElement>()
    const fileOnly: FileCheckReport = {
      totalRows: 100,
      problemRows: 0,
      problems: [
        report.problems[1],
        {
          kind: 'FORMULA_NO_VALUE',
          fieldCode: '',
          fieldLabel: '',
          columnHeader: null,
          columnLetter: 'D',
          code: 'FORMULA_NO_VALUE',
          message: 'Cell D7 has a formula with no saved value.',
          rowCount: 1,
          exampleRows: [7],
        },
      ],
    }
    render(
      <FileCheckDialog
        report={fileOnly}
        fileInput={fileInput}
        onFix={vi.fn()}
        onUploadAnyway={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByText(
        'The file has problems you can fix in the file. Fixing them in your spreadsheet first makes the upload go smoothly.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/0 of 100 rows/)).toBeNull()
    expect(screen.getByText('Column D')).toBeTruthy()
  })

  it('Fix the file and Upload anyway call their handlers', () => {
    const props = open()
    fireEvent.click(screen.getByRole('button', { name: 'Upload anyway' }))
    expect(props.onUploadAnyway).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Fix the file' }))
    expect(props.onFix).toHaveBeenCalledTimes(1)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('Escape closes without fixing', () => {
    const props = open()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onFix).not.toHaveBeenCalled()
  })

  it('moves focus to Fix the file when it opens, so Enter never sends the file', async () => {
    open()
    const fix = screen.getByRole('button', { name: 'Fix the file' })
    await waitFor(() => expect(document.activeElement).toBe(fix))
  })

  it('returns focus to the file input when it closes', async () => {
    const fileInput = createRef<HTMLInputElement>()
    function Harness() {
      const [shown, setShown] = useState(true)
      return (
        <>
          <input aria-label="file" ref={fileInput} />
          {shown ? (
            <FileCheckDialog
              report={report}
              fileInput={fileInput}
              onFix={() => setShown(false)}
              onUploadAnyway={vi.fn()}
              onClose={() => setShown(false)}
            />
          ) : null}
        </>
      )
    }
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(fileInput.current))
  })
})
