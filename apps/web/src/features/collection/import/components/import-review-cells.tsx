'use client'

import type { ImportRowReviewFieldResponse } from '@pathways/shared'

import { useHoverTip } from '@/components/pathways'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { selectClass } from '../../forms/components/intake-controls'

export type ReviewField = ImportRowReviewFieldResponse
type Cell = ReviewField['file']

export const cellText = (value: Cell | undefined) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

// What the reviewer typed, as the API expects the field's value.
export const ownPayload = (field: ReviewField, text: string) =>
  field.dataType === 'BOOLEAN'
    ? text === 'Yes'
    : field.dataType === 'MULTIPLE_SELECT'
      ? text
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : text

/** The fields a rule reads, where a wrong calculated or checked value is usually fixed. */
export function ruleInputs(rule: ReviewField['rule']): string[] {
  switch (rule?.kind) {
    case 'AGE_AT_DATE':
    case 'MINOR_AT_DATE':
      return [rule.birthField, rule.atField]
    case 'AGE_CHECK':
      return [rule.birthField, ...rule.atFields]
    case 'SAME_ANSWER_AS':
      return [rule.field]
    case 'WASHINGTON_GROUP_DISABILITY':
      return rule.questionFields
    case 'FOLLOW_UP_OF':
      return [rule.parentField]
    case 'ID_FROM_INITIALS_AND_BIRTH_DATE':
      return [rule.firstNameField, rule.lastNameField, rule.birthField]
    default:
      return []
  }
}

/** How the system worked out a calculated value, naming the row's other fields by label. */
export function calculationHint(rule: ReviewField['rule'], labelOf: (code: string) => string) {
  const lead = "The system works this out itself from the row's other answers."
  switch (rule?.kind) {
    case 'AGE_AT_DATE':
      return `${lead} Age in whole years from ${labelOf(rule.birthField)} to ${labelOf(rule.atField)}.`
    case 'MINOR_AT_DATE':
      return `${lead} Yes when the person is under 18 on the upload date, counted from ${labelOf(rule.birthField)}.`
    case 'AGE_CHECK':
      return `${lead} Age in whole years from ${labelOf(rule.birthField)} to the upload date, to check the file's age.`
    case 'SAME_ANSWER_AS':
      return `${lead} Same answer as ${labelOf(rule.field)}.`
    case 'WASHINGTON_GROUP_DISABILITY':
      return `${lead} With disability when any of the six Washington Group questions is answered ${rule.disabilityValues.map((value) => `"${value}"`).join(' or ')}; without disability when all six are answered otherwise.`
    default:
      return undefined
  }
}

/** One value the reviewer can click to keep; a value the source does not have is a greyed tile. */
export function ChoiceCell({
  label,
  column,
  value,
  missing,
  caption,
  hint,
  picked,
  disabled,
  onPick,
}: {
  label: string
  column: string
  value: Cell
  // What a greyed tile says when the source has no value at all.
  missing?: string
  // A small line above the value naming where it comes from.
  caption?: string
  // Shown on hover or focus.
  hint?: string
  picked: boolean
  disabled?: boolean
  onPick: () => void
}) {
  const { triggerProps, tip } = useHoverTip(hint)
  const absent = value === null && missing !== undefined
  const text = absent ? missing : cellText(value)
  return (
    <>
      <button
        {...triggerProps}
        aria-label={`${label}, ${column}: ${text ?? 'empty'}`}
        aria-pressed={picked}
        className={cn(
          'min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted disabled:text-disabled-foreground',
          picked
            ? 'border-primary bg-info-subtle font-medium'
            : 'border-input bg-card hover:bg-muted',
        )}
        disabled={disabled || absent}
        onClick={onPick}
        type="button"
      >
        {caption ? <span className="block text-xs text-muted-foreground">{caption}</span> : null}
        {text ?? <span className="text-muted-foreground">Empty</span>}
      </button>
      {tip}
    </>
  )
}

/** The reviewer's own value: a dropdown for a choice field, otherwise a text box. */
export function OwnValue({
  field,
  text,
  invalid,
  describedBy,
  onChange,
}: {
  field: ReviewField
  text: string
  invalid: boolean
  describedBy?: string
  onChange: (text: string) => void
}) {
  const options = field.dataType === 'BOOLEAN' ? ['Yes', 'No'] : field.options
  const common = {
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    'aria-label': `${field.label}, Your value`,
  }
  if (options && (field.dataType === 'SELECT' || field.dataType === 'BOOLEAN')) {
    return (
      <select
        {...common}
        className={cn(selectClass, text && 'border-primary bg-info-subtle')}
        onChange={(event) => onChange(event.target.value)}
        value={text}
      >
        <option value="">Choose an answer</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }
  return (
    <Input
      {...common}
      className={cn(text && 'border-primary bg-info-subtle')}
      onChange={(event) => onChange(event.target.value)}
      placeholder={
        field.dataType === 'MULTIPLE_SELECT' ? 'Separate answers with commas' : undefined
      }
      type={field.dataType === 'DATE' ? 'date' : 'text'}
      value={text}
    />
  )
}
