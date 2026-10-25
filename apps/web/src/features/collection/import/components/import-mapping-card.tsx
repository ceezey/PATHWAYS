'use client'

import { isCalculatedRule } from '@pathways/shared'
import { useState } from 'react'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { ToggleRow } from '../../forms/components/toggle-row'
import type { BatchIntake } from '../hooks/use-batch-intake'
import type { BatchProcessing } from '../hooks/use-batch-processing'
import type { BatchReview } from '../hooks/use-batch-review'
import type { ImportState } from '../hooks/use-import-state'
import { importProcessingComplete } from '../import-auto-continue'
import { automaticMatchReason, mappingLockedStatuses } from '../import.utils'
import { CoverageNotice } from './coverage-notice'
import { ImportDateOrder, columnDateOrders } from './import-date-order'
import { ImportValueMapEditor, emptyColumnRule } from './import-value-map-editor'

export function ImportMappingCard({
  state,
  review,
  run,
  intake,
  batch,
}: {
  state: Pick<
    ImportState,
    | 'canManageForms'
    | 'canProcess'
    | 'canReview'
    | 'canValidate'
    | 'columnValues'
    | 'mapping'
    | 'mappingEditable'
    | 'mappingHeading'
    | 'mappingNotice'
    | 'mutation'
    | 'openSuggestions'
    | 'pending'
    | 'receipts'
    | 'rules'
    | 'scope'
    | 'selectedForm'
    | 'setMapping'
    | 'setRules'
    | 'sourceColumns'
    | 'storedMappingByKey'
  >
  review: Pick<BatchReview, 'confirmSuggestions' | 'saveMapping' | 'validate'>
  run: Pick<BatchProcessing, 'process' | 'processingInterrupted'>
  intake: Pick<BatchIntake, 'prepareForm'>
  batch: NonNullable<ImportState['batch']>
}) {
  const {
    canManageForms,
    canProcess,
    canReview,
    canValidate,
    columnValues,
    mapping,
    mappingEditable,
    mappingHeading,
    mappingNotice,
    mutation,
    openSuggestions,
    pending,
    receipts,
    rules,
    scope,
    selectedForm,
    setMapping,
    setRules,
    sourceColumns,
    storedMappingByKey,
  } = state
  const { confirmSuggestions, saveMapping, validate } = review
  const { process, processingInterrupted } = run
  const receipt = receipts[batch.id]
  // The server computes coverage for any reader; the uploader's session receipt covers a batch not yet reloaded.
  // The counts describe the automatic revision only; a reviewer's later revision replaces them.
  const coverage =
    batch.coverage ?? (receipt?.mappingRevision === batch.mappingRevision ? receipt : null)
  const needsFormUpdate = coverage?.coverage === 'NOT_COVERED'
  // The columns undecided when the filter was switched on; deciding one keeps it in view.
  const [undecidedShown, setUndecidedShown] = useState<ReadonlySet<string> | null>(null)
  const referenceYear = new Date(batch.uploadedAt ?? Date.now()).getUTCFullYear()
  // The column's date type: the reviewer's declared type, else the target field's.
  const dateColumn = (key: string) =>
    (rules[key]?.dataType ||
      selectedForm?.fields.find((field) => field.code === mapping[key])?.dataType) === 'DATE'
  const undecided = (key: string) =>
    !mapping[key] ||
    mapping[key] === '__pending__' ||
    openSuggestions.some((item) => item.column.key === key) ||
    (dateColumn(key) &&
      !rules[key]?.dateOrder &&
      columnDateOrders(columnValues.get(key), referenceYear).needsChoice)
  const shownColumns = undecidedShown
    ? sourceColumns.filter((column) => undecidedShown.has(column.key))
    : sourceColumns
  // Mirrors the server's validation refusal: a required field needs a column, a default or a calculation.
  const mappedCodes = new Set(Object.values(mapping))
  const unsupplied =
    selectedForm?.fields.filter(
      (field) =>
        field.required &&
        !mappedCodes.has(field.code) &&
        !field.importDefault &&
        !isCalculatedRule(field.rule),
    ) ?? []
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              <span ref={mappingHeading} tabIndex={-1}>
                Reviewed mapping revision {batch.mappingRevision}
              </span>
            </CardTitle>
            <CardDescription>
              Every source column must target one field or be explicitly ignored.
            </CardDescription>
          </div>
          {canReview ? (
            <Button
              disabled={!mappingEditable || openSuggestions.length === 0}
              variant="outline"
              onClick={() => confirmSuggestions(openSuggestions)}
            >
              Confirm all suggestions
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {needsFormUpdate ? (
          <CoverageNotice
            receipt={coverage}
            canPrepare={canManageForms}
            pending={pending}
            onPrepare={() => void intake.prepareForm()}
          />
        ) : null}
        <output aria-live="polite" className="block text-sm text-muted-foreground">
          {mappingNotice}
        </output>
        <ToggleRow
          checked={undecidedShown !== null}
          label={`Show only columns that need a decision (${sourceColumns.filter((column) => undecided(column.key)).length} of ${sourceColumns.length})`}
          onChange={(on) =>
            setUndecidedShown(
              on
                ? new Set(
                    sourceColumns
                      .filter((column) => undecided(column.key))
                      .map((column) => column.key),
                  )
                : null,
            )
          }
        />
        {shownColumns.map((column) => {
          const stored = storedMappingByKey.get(column.key)
          const automatic = automaticMatchReason(stored)
          const targetField = selectedForm?.fields.find(
            (field) => field.code === mapping[column.key],
          )
          const suggestion = openSuggestions.find((item) => item.column.key === column.key)
          return (
            <div
              key={column.key}
              className="grid items-center gap-3 rounded-lg border p-3 sm:grid-cols-2"
            >
              <div className="space-y-1">
                <span className="block break-all text-sm font-medium">
                  Column {column.columnIndex}: {column.header}
                </span>
                {automatic ? (
                  <StatusBadge tone="success">Auto-matched: {automatic}</StatusBadge>
                ) : null}
                {suggestion ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>Suggested: {suggestion.label}</span>
                    {canReview ? (
                      <Button
                        aria-label={`Confirm suggestion ${suggestion.label} for column ${column.columnIndex}`}
                        disabled={!mappingEditable}
                        size="sm"
                        className="min-h-11"
                        variant="outline"
                        onClick={() => confirmSuggestions([suggestion], column.key)}
                      >
                        Confirm
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">
                        An authorized reviewer can confirm it.
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
              <Select
                disabled={!mappingEditable}
                value={mapping[column.key] ?? '__pending__'}
                onValueChange={(value) =>
                  !mutation.current &&
                  scope.isCurrent() &&
                  setMapping((current) => ({ ...current, [column.key]: value }))
                }
              >
                <SelectTrigger
                  aria-label={`Target for column ${column.columnIndex}: ${column.header}`}
                  id={`import-mapping-target-${column.key}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pending__">
                    Pending: select a target or explicit ignore
                  </SelectItem>
                  <SelectItem value="__ignore__">Ignore this source column</SelectItem>
                  {selectedForm?.fields.map((field) => (
                    <SelectItem key={field.code} value={field.code}>
                      {field.label} ({field.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {targetField && dateColumn(column.key) ? (
                <ImportDateOrder
                  columnLabel={`column ${column.columnIndex}`}
                  disabled={!mappingEditable}
                  idPrefix={`import-rule-${column.key}`}
                  referenceYear={referenceYear}
                  value={rules[column.key]?.dateOrder ?? ''}
                  values={columnValues.get(column.key)}
                  onChange={(dateOrder) =>
                    !mutation.current &&
                    scope.isCurrent() &&
                    setRules((current) => ({
                      ...current,
                      [column.key]: { ...(current[column.key] ?? emptyColumnRule), dateOrder },
                    }))
                  }
                />
              ) : null}
              {targetField ? (
                <details className="sm:col-span-2">
                  <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-primary">
                    Data type and value translations
                    {rules[column.key]?.pairs.length ? ` (${rules[column.key]?.pairs.length})` : ''}
                  </summary>
                  <ImportValueMapEditor
                    allowedValues={targetField.allowedValues}
                    sourceValues={columnValues.get(column.key)}
                    columnLabel={`column ${column.columnIndex}`}
                    disabled={!mappingEditable}
                    fieldType={targetField.dataType}
                    idPrefix={`import-rule-${column.key}`}
                    rule={rules[column.key] ?? emptyColumnRule}
                    onChange={(next) =>
                      !mutation.current &&
                      scope.isCurrent() &&
                      setRules((current) => ({ ...current, [column.key]: next }))
                    }
                  />
                </details>
              ) : null}
            </div>
          )
        })}
        {unsupplied.length ? (
          <p className="rounded-md border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
            Validation will be refused: these required fields have no source column, default or
            calculation: {unsupplied.map((field) => `${field.label} (${field.code})`).join(', ')}.
            Map a column to each, or set a default or calculation in a new form version.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!mappingEditable} onClick={() => void saveMapping()}>
            Save new mapping revision
          </Button>
          <Button
            disabled={
              !canValidate ||
              pending ||
              batch.mappingRevision < 1 ||
              mappingLockedStatuses.has(batch.status)
            }
            variant="outline"
            onClick={() => void validate()}
          >
            Validate all rows
          </Button>
          <Button
            disabled={
              !canProcess ||
              pending ||
              batch.validationRevision < 1 ||
              !['VALIDATED', 'PROCESSING', 'PARTIALLY_PROCESSED'].includes(batch.status)
            }
            variant="outline"
            onClick={() => void process()}
          >
            {processingInterrupted ||
            batch.status === 'PROCESSING' ||
            (batch.status === 'PARTIALLY_PROCESSED' && !importProcessingComplete(batch))
              ? 'Resume processing'
              : 'Process all valid rows'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
