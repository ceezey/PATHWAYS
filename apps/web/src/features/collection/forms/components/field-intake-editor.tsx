'use client'

import { IMPORT_VALUE_MAP_LIMITS } from '@pathways/imports'
import { CALCULATED_RULE_KINDS, CONSENT_FIELD_CODES } from '@pathways/shared'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { FormField } from '../../collection.utils'
import { ChipListInput, selectClass } from './intake-controls'
import { IntakeRuleEditor } from './intake-rule-editor'

const noDefault = 'No default'
const isCalculated = (kind: string) => (CALCULATED_RULE_KINDS as readonly string[]).includes(kind)

/** Edits how a field reads imported files: source names, answer aliases, a default and a rule. */
export function FieldIntakeEditor({
  field,
  fieldCodes,
  readOnly,
  onChange,
}: {
  field: FormField
  fieldCodes: string[]
  readOnly: boolean
  onChange: (patch: Partial<FormField>) => void
}) {
  const id = `${field.id}-intake`
  const isChoice = field.type === 'single_select' || field.type === 'multi_select'
  const consent = (CONSENT_FIELD_CODES as readonly string[]).includes(field.code)
  const calculatedField = field.rule && isCalculated(field.rule.kind)
  const choices = field.type === 'boolean' ? ['true', 'false'] : field.allowedValues
  const setAlias = (index: number, key: 'from' | 'to', value: string) =>
    onChange({
      valueAliases: field.valueAliases.map((alias, at) =>
        at === index ? { ...alias, [key]: value } : alias,
      ),
    })
  return (
    <div className="space-y-4 border-t pt-4 md:col-span-2">
      <p className="text-sm font-semibold">Import metadata</p>
      <div className="space-y-2">
        <p className="text-sm font-medium">Source names</p>
        <p className="text-xs text-muted-foreground">
          Column headers in imported files that mean this field.
        </p>
        <ChipListInput
          id={`${id}-source`}
          noun="source name"
          values={field.sourceNames}
          max={20}
          maxLength={100}
          readOnly={readOnly}
          onChange={(sourceNames) => onChange({ sourceNames })}
        />
      </div>
      {isChoice ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Answer aliases</legend>
          <p className="text-xs text-muted-foreground">
            Answers in imported files that mean one of the allowed values.
          </p>
          {field.valueAliases.map((alias, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable identity while editing
              key={index}
              className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
            >
              <div className="space-y-1">
                <Label htmlFor={`${id}-from-${index}`}>Source value {index + 1}</Label>
                <Input
                  disabled={readOnly}
                  id={`${id}-from-${index}`}
                  maxLength={IMPORT_VALUE_MAP_LIMITS.maxTextLength}
                  value={alias.from}
                  onChange={(event) => setAlias(index, 'from', event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${id}-to-${index}`}>Stored value {index + 1}</Label>
                <select
                  className={selectClass}
                  disabled={readOnly}
                  id={`${id}-to-${index}`}
                  value={alias.to}
                  onChange={(event) => setAlias(index, 'to', event.target.value)}
                >
                  <option value="">Choose a value</option>
                  {(field.allowedValues.includes(alias.to) || !alias.to
                    ? field.allowedValues
                    : [alias.to, ...field.allowedValues]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                aria-label={`Remove alias ${index + 1}`}
                disabled={readOnly}
                size="icon"
                type="button"
                variant="outline"
                onClick={() =>
                  onChange({ valueAliases: field.valueAliases.filter((_, at) => at !== index) })
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            disabled={readOnly || field.valueAliases.length >= IMPORT_VALUE_MAP_LIMITS.maxEntries}
            type="button"
            variant="outline"
            onClick={() =>
              onChange({ valueAliases: [...field.valueAliases, { from: '', to: '' }] })
            }
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add alias
          </Button>
        </fieldset>
      ) : null}
      {consent || calculatedField ? null : (
        <div className="space-y-1">
          <Label htmlFor={`${id}-default`}>Import default</Label>
          {isChoice || field.type === 'boolean' ? (
            <select
              className={selectClass}
              disabled={readOnly}
              id={`${id}-default`}
              value={field.importDefault}
              onChange={(event) => onChange({ importDefault: event.target.value })}
            >
              <option value="">{noDefault}</option>
              {choices.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : (
            <Input
              disabled={readOnly}
              id={`${id}-default`}
              maxLength={120}
              type={field.type === 'date' ? 'date' : 'text'}
              value={field.importDefault}
              onChange={(event) => onChange({ importDefault: event.target.value })}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Used when the file has no column for this field.
          </p>
        </div>
      )}
      <IntakeRuleEditor
        idPrefix={`${id}-rule`}
        fieldCode={field.code}
        fieldCodes={fieldCodes}
        rule={field.rule}
        readOnly={readOnly}
        onChange={(rule) =>
          // A calculated field cannot also have an import default.
          onChange(
            rule && isCalculated(rule.kind) && field.importDefault
              ? { rule, importDefault: '' }
              : { rule },
          )
        }
      />
    </div>
  )
}
