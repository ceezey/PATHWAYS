'use client'

import {
  IMPORT_VALUE_MAP_LIMITS,
  compatibleImportDataTypes,
  suggestValueMap,
} from '@pathways/imports'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'

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
  /** Distinct values seen in the loaded rows for this column. */
  sourceValues?: string[]
  /** The target field's allowed values, for choice fields. */
  allowedValues?: string[] | null
}

/** Values a translation may produce for the field, or none when suggestions do not apply. */
function suggestionTargets(fieldType: FormFieldDataType, allowedValues?: string[] | null) {
  if (fieldType === 'BOOLEAN') return ['true', 'false']
  return fieldType === 'SELECT' ? (allowedValues ?? []) : []
}

export function ImportValueMapEditor({
  columnLabel,
  idPrefix,
  fieldType,
  disabled,
  rule,
  onChange,
  sourceValues = [],
  allowedValues,
}: Props) {
  const [suggestNote, setSuggestNote] = useState('')
  const types = compatibleImportDataTypes(fieldType)
  const full = rule.pairs.length >= IMPORT_VALUE_MAP_LIMITS.maxEntries
  const targets = suggestionTargets(fieldType, allowedValues)
  const suggest = () => {
    const kept = rule.pairs.filter((pair) => pair.from.trim())
    // Booleans already accept true and false in any case, so only other spellings need a pair.
    const values =
      fieldType === 'BOOLEAN'
        ? sourceValues.filter((value) => !/^(true|false)$/i.test(value.trim()))
        : sourceValues
    const { pairs, unmatched } = suggestValueMap(values, targets, kept)
    onChange({ ...rule, pairs: [...kept, ...pairs] })
    setSuggestNote(
      `${pairs.length} suggested from the loaded rows. ${
        unmatched.length
          ? `${unmatched.length} need a translation you choose.`
          : 'Review before saving.'
      }`,
    )
  }
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
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || full}
            type="button"
            variant="outline"
            onClick={() => onChange({ ...rule, pairs: [...rule.pairs, { from: '', to: '' }] })}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {full ? `Limit of ${IMPORT_VALUE_MAP_LIMITS.maxEntries} reached` : 'Add translation'}
          </Button>
          {targets.length && sourceValues.length ? (
            <Button
              aria-label={`Suggest translations for ${columnLabel}`}
              disabled={disabled || full}
              type="button"
              variant="outline"
              onClick={suggest}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Suggest translations
            </Button>
          ) : null}
        </div>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {suggestNote}
        </p>
      </fieldset>
    </div>
  )
}
