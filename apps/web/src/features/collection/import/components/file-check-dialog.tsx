'use client'

import type { FileCheckProblem, FileCheckReport } from '@pathways/imports'
import { TriangleAlert } from 'lucide-react'
import type { RefObject } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { headClass } from '../import.utils'

const column = (problem: FileCheckProblem) => {
  if (problem.columnHeader)
    return `${problem.columnHeader}${problem.columnLetter ? ` (${problem.columnLetter})` : ''}`
  return problem.fieldLabel || (problem.columnLetter ? `Column ${problem.columnLetter}` : '')
}

function DateBlock({ date }: { date: NonNullable<FileCheckProblem['date']> }) {
  const { example, evidence } = date
  return (
    <div className="mt-2 space-y-1 border-l-2 border-warning/40 pl-3 text-xs text-muted-foreground">
      {example ? (
        <p>
          {example.shown && example.shown !== example.read
            ? `Read as: ${example.shown} was read as ${example.read}`
            : `Read as: ${example.read}`}
        </p>
      ) : null}
      {evidence ? (
        <p>
          {`${evidence.agreeing} of ${evidence.of} rows' ages match ${
            evidence.reading === 'TYPED_YY_MM_DD'
              ? 'when read as YY/MM/DD'
              : 'with day and month swapped'
          }`}
        </p>
      ) : null}
      <p>{`Preferred format: ${date.preferred}`}</p>
      <p>{date.fix}</p>
    </div>
  )
}

/** Tells the person which rows would need one-by-one review and asks them to fix the file first. */
export function FileCheckDialog({
  report,
  fileInput,
  onFix,
  onUploadAnyway,
  onClose,
}: {
  report: FileCheckReport
  // Where focus goes when the dialog closes, the file input the person picks the corrected file with.
  fileInput: RefObject<HTMLInputElement | null>
  onFix: () => void
  onUploadAnyway: () => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl sm:max-w-3xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          fileInput.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Check your file before uploading</DialogTitle>
          <DialogDescription className="sr-only">
            Problems found in the chosen file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            {report.problemRows === 0
              ? 'The file has problems you can fix in the file. Fixing them in your spreadsheet first makes the upload go smoothly.'
              : `${report.problemRows} of ${report.totalRows} rows have problems you can fix in the file. Fixing them in your spreadsheet first makes the upload go smoothly. Uploaded as it is, each of these rows has to be reviewed here one by one.`}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={headClass}>Column</TableHead>
              <TableHead className={headClass}>Problem</TableHead>
              <TableHead className={cn(headClass, 'text-right')}>Rows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.problems.map((problem) => (
              <TableRow
                key={`${problem.kind}:${problem.fieldCode}:${problem.code}:${problem.message}`}
              >
                <TableCell className="align-top">{column(problem)}</TableCell>
                <TableCell className="align-top">
                  <p>{problem.message}</p>
                  {problem.exampleRows.length ? (
                    <p className="text-xs text-muted-foreground">
                      {`Rows ${problem.exampleRows.join(', ')}`}
                    </p>
                  ) : null}
                  {problem.date ? <DateBlock date={problem.date} /> : null}
                </TableCell>
                <TableCell className="text-right align-top">{problem.rowCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={onUploadAnyway}>
            Upload anyway
          </Button>
          <Button onClick={onFix}>Fix the file</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
