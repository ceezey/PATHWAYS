'use client'

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

import type { BatchIntake } from '../hooks/use-batch-intake'
import type { BatchProcessing } from '../hooks/use-batch-processing'
import type { BatchReview } from '../hooks/use-batch-review'
import type { ImportState } from '../hooks/use-import-state'
import { importProcessingComplete } from '../import-auto-continue'
import { automaticMatchReason, mappingLockedStatuses } from '../import.utils'
import { CoverageNotice } from './coverage-notice'
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
        {sourceColumns.map((column) => {
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
              {targetField ? (
                <div className="sm:col-span-2">
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
                </div>
              ) : null}
            </div>
          )
        })}
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
