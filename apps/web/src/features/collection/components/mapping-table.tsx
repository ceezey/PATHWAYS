'use client'

import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import type { MappingReadiness, MappingRow, MappingStatus } from '../collection-import-state'
import {
  type CollectionMode,
  type CollectionView,
  type FormField,
  tableHeadClass,
} from '../collection.utils'

export const MappingTable = ({
  canProceed,
  createsDraft,
  fields,
  mappingRows,
  mappingReadiness,
  mode,
  setMappingRows,
  setProceedDialogOpen,
  setView,
}: {
  canProceed: boolean
  createsDraft: boolean
  fields: FormField[]
  mappingRows: MappingRow[]
  mappingReadiness: MappingReadiness
  mode: CollectionMode
  setMappingRows: React.Dispatch<React.SetStateAction<MappingRow[]>>
  setProceedDialogOpen: (open: boolean) => void
  setView: (view: CollectionView) => void
}) => {
  const labelFor = (code: string) => fields.find((field) => field.code === code)?.label ?? code
  // Header-only questionnaires target new field codes that are not builder fields yet.
  const targetOptions = [
    ...fields.map((field) => ({ code: field.code, label: field.label })),
    ...mappingRows
      .filter((row) => row.targetField && !fields.some((field) => field.code === row.targetField))
      .map((row) => ({ code: row.targetField, label: row.sourceColumn })),
  ].filter((option, index, all) => all.findIndex((other) => other.code === option.code) === index)
  return (
    <SectionCard
      className="min-w-0"
      title="Metadata mapping"
      description="Review source columns, target fields, and validation states."
      actions={
        <>
          {mode === 'extend' ? (
            <Button variant="outline" onClick={() => setView('builder')}>
              Extend in builder
            </Button>
          ) : null}
          <Button
            aria-describedby="mapping-readiness-message"
            disabled={!canProceed}
            onClick={() => setProceedDialogOpen(true)}
          >
            {createsDraft ? 'Create draft' : 'Proceed'}
          </Button>
        </>
      }
    >
      <p
        className={cn(
          'rounded-md px-3 py-2 text-sm',
          canProceed && mappingReadiness.canProceed
            ? 'bg-success-subtle text-success'
            : 'bg-warning-subtle text-warning',
        )}
        id="mapping-readiness-message"
      >
        {canProceed && !mappingReadiness.canProceed && !createsDraft
          ? 'This file can be uploaded to staging. An authorized reviewer must resolve unmatched columns before validation and processing.'
          : canProceed
            ? mappingReadiness.message
            : mappingReadiness.canProceed
              ? 'The current file must finish successfully before proceeding.'
              : mappingReadiness.message}
      </p>
      <section
        aria-label="Metadata mapping rows"
        className="mt-4 max-w-full overflow-x-auto rounded-lg border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
        tabIndex={0}
      >
        <table className="w-full min-w-[720px] text-sm">
          <TableHeader>
            <TableRow className="h-10">
              <TableHead className={tableHeadClass}>Source columns</TableHead>
              <TableHead className={tableHeadClass}>Target fields</TableHead>
              <TableHead className={tableHeadClass}>Mapping status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappingRows.map((row) => (
              <TableRow key={row.id} className="h-14">
                <TableCell className="max-w-[220px] font-medium text-foreground">
                  <span className="block truncate" title={row.sourceColumn}>
                    {row.sourceColumn}
                  </span>
                  {row.autoMatched && row.status === 'mapped' ? (
                    <StatusBadge tone="success">Auto-matched</StatusBadge>
                  ) : null}
                  {row.suggestedField && row.status !== 'mapped' ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Suggested: {labelFor(row.suggestedField)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Select
                    value={row.targetField || 'none'}
                    onValueChange={(value) =>
                      setMappingRows((currentRows) =>
                        currentRows.map((currentRow) =>
                          currentRow.id === row.id
                            ? {
                                ...currentRow,
                                targetField: value === 'none' ? '' : value,
                                status: value === 'none' ? 'unmapped' : 'mapped',
                                autoMatched: false,
                              }
                            : currentRow,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No target field</SelectItem>
                      {targetOptions.map((option) => (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={row.status}
                    onValueChange={(value) =>
                      setMappingRows((currentRows) =>
                        currentRows.map((currentRow) =>
                          currentRow.id === row.id
                            ? { ...currentRow, status: value as MappingStatus }
                            : currentRow,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem disabled={!row.targetField} value="mapped">
                        Mapped
                      </SelectItem>
                      <SelectItem value="unmapped">Unmapped</SelectItem>
                      <SelectItem value="ignored">Ignored</SelectItem>
                      <SelectItem value="invalid">Invalid</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </section>
    </SectionCard>
  )
}
