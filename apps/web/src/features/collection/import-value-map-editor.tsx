'use client'

import { IMPORT_VALUE_MAP_LIMITS, compatibleImportDataTypes } from '@pathways/imports'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FormFieldDataType, ImportMappingInput } from '@/types/pathways'

export interface ColumnRuleDraft {
  dataType: FormFieldDataType | ''
  pairs: Array<{ from: string; to: string }>
}

export const emptyColumnRule: ColumnRuleDraft = { dataType: '', pairs: [] }

/** Complete pairs only; blank rows are dropped so an unfinished row never blocks saving. */
export function ruleToMappingInput(rule: ColumnRuleDraft | undefined, fieldType?: string) {
  const pairs = (rule?.pairs ?? []).filter((pair) => pair.from.trim())
  const dataType =
    rule?.dataType &&
    compatibleImportDataTypes(fieldType as FormFieldDataType).includes(rule.dataType)
      ? rule.dataType
      : undefined
  return {
    ...(dataType ? { dataType } : {}),
    ...(pairs.length ? { valueMap: pairs } : {}),
  } satisfies Pick<ImportMappingInput, 'dataType' | 'valueMap'>
}

interface Props {
  columnLabel: string
  idPrefix: string
  fieldType: FormFieldDataType
  disabled: boolean
  rule: ColumnRuleDraft
  onChange: (next: ColumnRuleDraft) => void
}

export function ImportValueMapEditor({
  columnLabel,
  idPrefix,
  fieldType,
  disabled,
  rule,
  onChange,
}: Props) {
  const types = compatibleImportDataTypes(fieldType)
  const full = rule.pairs.length >= IMPORT_VALUE_MAP_LIMITS.maxEntries
  const setPair = (index: number, key: 'from' | 'to', value: string) =>
    onChange({
      ...rule,
      pairs: rule.pairs.map((pair, at) => (at === index ? { ...pair, [key]: value } : pair)),
    })
  return (
    <div className="space-y-3 rounded-md border bg-surface-subtle p-3">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-type`}>Data type for {columnLabel}</Label>
        <Select
          disabled={disabled}
          value={rule.dataType || '__field__'}
          onValueChange={(value) =>
            onChange({
              ...rule,
              dataType: value === '__field__' ? '' : (value as FormFieldDataType),
            })
          }
        >
          <SelectTrigger id={`${idPrefix}-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__field__">Use the field type ({fieldType})</SelectItem>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Value translations for {columnLabel}</legend>
        <p className="text-xs text-muted-foreground">
          Exact match, ignoring case and spaces. Values without a translation are kept as they are.
          Rows that still fail stay staged with a reason.
        </p>
        {rule.pairs.map((pair, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable identity while editing
            key={index}
            className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-from-${index}`}>Source value {index + 1}</Label>
              <Input
                disabled={disabled}
                id={`${idPrefix}-from-${index}`}
                maxLength={IMPORT_VALUE_MAP_LIMITS.maxTextLength}
                value={pair.from}
                onChange={(event) => setPair(index, 'from', event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-to-${index}`}>Stored value {index + 1}</Label>
              <Input
                disabled={disabled}
                id={`${idPrefix}-to-${index}`}
                maxLength={IMPORT_VALUE_MAP_LIMITS.maxTextLength}
                value={pair.to}
                onChange={(event) => setPair(index, 'to', event.target.value)}
              />
            </div>
            <Button
              aria-label={`Remove translation ${index + 1} for ${columnLabel}`}
              disabled={disabled}
              size="icon"
              type="button"
              variant="outline"
              onClick={() =>
                onChange({ ...rule, pairs: rule.pairs.filter((_, at) => at !== index) })
              }
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          disabled={disabled || full}
          type="button"
          variant="outline"
          onClick={() => onChange({ ...rule, pairs: [...rule.pairs, { from: '', to: '' }] })}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {full ? `Limit of ${IMPORT_VALUE_MAP_LIMITS.maxEntries} reached` : 'Add translation'}
        </Button>
      </fieldset>
    </div>
  )
}
