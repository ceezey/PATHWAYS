'use client'

import { CALCULATED_RULE_KINDS, type FieldIntakeRule, INTAKE_RULE_KINDS } from '@pathways/shared'
import { Plus, Trash2 } from 'lucide-react'

import { MetricTooltip } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

import { intakeHelp, ruleKindLabels } from '../../collection.copy'
import { ChipListInput, FieldSelect, selectClass } from './intake-controls'

type Kind = FieldIntakeRule['kind']

const calculated: readonly string[] = CALCULATED_RULE_KINDS
// SAME_ANSWER_AS links only the two consent fields and is set by hand on this one.
const sameAnswerHost = 'consent_recorded'
const sameAnswerTarget = 'data_processing_consent_recorded'

/** A rule of the given kind with nothing chosen yet. */
function blankRule(kind: Kind): FieldIntakeRule {
  switch (kind) {
    case 'AGE_AT_DATE':
    case 'MINOR_AT_DATE':
      return { kind, birthField: '', atField: '' }
    case 'WASHINGTON_GROUP_DISABILITY':
      return {
        kind,
        questionFields: ['', '', '', '', '', ''],
        disabilityValues: [],
      }
    case 'SAME_ANSWER_AS':
      return { kind, field: sameAnswerTarget }
    case 'AGE_CHECK':
      return { kind, birthField: '', atFields: [''] }
    case 'FOLLOW_UP_OF':
      return { kind, parentField: '', whenValues: [] }
    case 'ID_FROM_INITIALS_AND_BIRTH_DATE':
      return { kind, firstNameField: '', lastNameField: '', birthField: '' }
  }
}

/** The kind select and the field pickers of the chosen rule. */
export function IntakeRuleEditor({
  idPrefix,
  fieldCode,
  fieldCodes,
  rule,
  readOnly,
  onChange,
}: {
  idPrefix: string
  fieldCode: string
  fieldCodes: string[]
  rule: FieldIntakeRule | null
  readOnly: boolean
  onChange: (rule: FieldIntakeRule | null) => void
}) {
  const pick = (id: string, label: string, value: string, set: (code: string) => void) => (
    <FieldSelect
      id={`${idPrefix}-${id}`}
      label={label}
      value={value}
      codes={fieldCodes}
      readOnly={readOnly}
      onChange={set}
    />
  )
  const kinds = INTAKE_RULE_KINDS.filter(
    (kind) => kind !== 'SAME_ANSWER_AS' || fieldCode === sameAnswerHost || rule?.kind === kind,
  )
  const options = (group: (kind: Kind) => boolean) =>
    kinds.filter(group).map((kind) => (
      <option key={kind} value={kind}>
        {ruleKindLabels[kind]}
      </option>
    ))
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Label htmlFor={`${idPrefix}-kind`}>Calculation or check</Label>
          <MetricTooltip label="Calculation or check">
            {intakeHelp.calculationOrCheck}
          </MetricTooltip>
        </div>
        <select
          className={selectClass}
          disabled={readOnly}
          id={`${idPrefix}-kind`}
          value={rule?.kind ?? ''}
          onChange={(event) =>
            onChange(event.target.value ? blankRule(event.target.value as Kind) : null)
          }
        >
          <option value="">No calculation or check</option>
          <optgroup label="PATHWAYS fills in the value">
            {options((kind) => calculated.includes(kind))}
          </optgroup>
          <optgroup label="PATHWAYS only checks the column">
            {options((kind) => !calculated.includes(kind))}
          </optgroup>
        </select>
      </div>
      {rule?.kind === 'AGE_AT_DATE' || rule?.kind === 'MINOR_AT_DATE' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {pick('birth', 'Birth date field', rule.birthField, (code) =>
            onChange({ ...rule, birthField: code }),
          )}
          {pick('at', 'Date to measure at', rule.atField, (code) =>
            onChange({ ...rule, atField: code }),
          )}
        </div>
      ) : null}
      {rule?.kind === 'WASHINGTON_GROUP_DISABILITY' ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {rule.questionFields.map((code, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the six questions are positional
              <div key={index}>
                {pick(`question-${index}`, `Question field ${index + 1}`, code, (next) =>
                  onChange({
                    ...rule,
                    questionFields: rule.questionFields.map((item, at) =>
                      at === index ? next : item,
                    ),
                  }),
                )}
              </div>
            ))}
          </div>
          <p className="text-sm font-medium">Answers that count as a disability</p>
          <ChipListInput
            id={`${idPrefix}-disability`}
            noun="disability answer"
            values={rule.disabilityValues}
            max={8}
            maxLength={120}
            readOnly={readOnly}
            onChange={(disabilityValues) => onChange({ ...rule, disabilityValues })}
          />
        </div>
      ) : null}
      {rule?.kind === 'SAME_ANSWER_AS' ? (
        <p className="text-sm text-muted-foreground">
          Copies the answer of {sameAnswerTarget}. Use it only if the signed consent covered both. A
          participant who said no or left it blank is held.
        </p>
      ) : null}
      {rule?.kind === 'AGE_CHECK' ? (
        <div className="space-y-3">
          {pick('birth', 'Birth date field', rule.birthField, (code) =>
            onChange({ ...rule, birthField: code }),
          )}
          {rule.atFields.map((code, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable identity while editing
              key={index}
              className="grid items-end gap-2 sm:grid-cols-[1fr_auto]"
            >
              {pick(`at-${index}`, `Date field ${index + 1}`, code, (next) =>
                onChange({
                  ...rule,
                  atFields: rule.atFields.map((item, at) => (at === index ? next : item)),
                }),
              )}
              <Button
                aria-label={`Remove date field ${index + 1}`}
                disabled={readOnly || rule.atFields.length === 1}
                size="icon"
                type="button"
                variant="outline"
                onClick={() =>
                  onChange({ ...rule, atFields: rule.atFields.filter((_, at) => at !== index) })
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            disabled={readOnly || rule.atFields.length >= 10}
            type="button"
            variant="outline"
            onClick={() => onChange({ ...rule, atFields: [...rule.atFields, ''] })}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add date field
          </Button>
        </div>
      ) : null}
      {rule?.kind === 'FOLLOW_UP_OF' ? (
        <div className="space-y-3">
          {pick('parent', 'Field this depends on', rule.parentField, (code) =>
            onChange({ ...rule, parentField: code }),
          )}
          <p className="text-sm font-medium">Fill only when that field is</p>
          <ChipListInput
            id={`${idPrefix}-when`}
            noun="answer"
            values={rule.whenValues}
            max={20}
            maxLength={120}
            readOnly={readOnly}
            onChange={(whenValues) => onChange({ ...rule, whenValues })}
          />
        </div>
      ) : null}
      {rule?.kind === 'ID_FROM_INITIALS_AND_BIRTH_DATE' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {pick('first', 'First name field', rule.firstNameField, (code) =>
            onChange({ ...rule, firstNameField: code }),
          )}
          {pick('last', 'Last name field', rule.lastNameField, (code) =>
            onChange({ ...rule, lastNameField: code }),
          )}
          {pick('birth', 'Birth date field', rule.birthField, (code) =>
            onChange({ ...rule, birthField: code }),
          )}
        </div>
      ) : null}
    </div>
  )
}
