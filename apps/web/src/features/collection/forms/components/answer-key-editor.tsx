'use client'

import { CONSENT_FIELD_CODES, type FieldIntakeRule, formDefinitionLimits } from '@pathways/shared'
import { useEffect, useState } from 'react'

import { Label } from '@/components/ui/label'

import { answerKeyCopy } from '../../collection.copy'
import type { FormField } from '../../collection.utils'
import { identityFields } from '../../import/import.utils'
import { ChipListInput, selectClass } from './intake-controls'
import { ToggleRow } from './toggle-row'

type KeyRule = Extract<FieldIntakeRule, { kind: 'TOTAL_SCORE' }>
type Question = KeyRule['questions'][number]
type Mode = 'none' | 'any' | 'answers'

// Never scored: the survey's own columns, the consent answer, and the identity block (middle name is a stage seed).
const unscored: ReadonlySet<string> = new Set([
  ...CONSENT_FIELD_CODES,
  ...identityFields,
  'middle_name',
  'stage_date',
  'total_score',
])
// A key lists at most 20 correct answers for one question.
const maxAnswers = 20
const isChoice = (field: FormField) =>
  field.type === 'single_select' || field.type === 'multi_select'
// Answers match as text, so only choice fields with options and text fields can be given correct answers.
const canListAnswers = (field: FormField) =>
  isChoice(field)
    ? field.allowedValues.length > 0
    : field.type === 'text' || field.type === 'long_text'

/** Marks which questions of a survey score a point, and which answers earn it. */
export function AnswerKeyEditor({
  fields,
  rule,
  onChange,
  disabled,
}: {
  fields: FormField[]
  rule: KeyRule | null
  onChange: (rule: KeyRule | null) => void
  disabled: boolean
}) {
  const rows = fields.filter((field) => field.code && !unscored.has(field.code))
  // A question whose field is gone cannot be saved, so it is dropped from the key.
  const kept = (rule?.questions ?? []).filter((q) => rows.some((row) => row.code === q.field))
  const keyed = new Map<string, Question>(kept.map((q) => [q.field, q]))
  useEffect(() => {
    if (!disabled && rule && kept.length !== rule.questions.length)
      onChange(kept.length ? { kind: 'TOTAL_SCORE', questions: kept } : null)
  })
  // Questions set to Correct answers before any answer is chosen; the rule cannot hold them yet.
  const [listing, setListing] = useState<ReadonlySet<string>>(new Set())
  const answersOf = (code: string) => {
    const question = keyed.get(code)
    return question && 'answers' in question ? question.answers : []
  }
  const modeOf = (code: string): Mode => {
    const question = keyed.get(code)
    if (question) return 'anyAnswer' in question ? 'any' : 'answers'
    return listing.has(code) ? 'answers' : 'none'
  }
  const set = (code: string, question: Question | null) => {
    const questions = rows.flatMap((row) => {
      const next = row.code === code ? question : keyed.get(row.code)
      return next ? [next] : []
    })
    onChange(questions.length ? { kind: 'TOTAL_SCORE', questions } : null)
  }
  const setMode = (code: string, mode: Mode) => {
    setListing((current) => {
      const next = new Set(current)
      if (mode === 'answers') next.add(code)
      else next.delete(code)
      return next
    })
    set(code, mode === 'any' ? { field: code, anyAnswer: true } : null)
  }
  const setAnswers = (code: string, answers: string[]) =>
    set(code, answers.length ? { field: code, answers } : null)

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{answerKeyCopy.intro}</p>
      {rows.length ? (
        rows.map((field) => {
          const label = field.label || field.code
          const mode = modeOf(field.code)
          const answers = answersOf(field.code)
          const id = `answer-key-${field.code}`
          return (
            <div key={field.id} className="space-y-2 rounded-md border border-border p-3">
              <Label htmlFor={id}>{label}</Label>
              <select
                className={selectClass}
                disabled={disabled}
                id={id}
                value={mode}
                onChange={(event) => setMode(field.code, event.target.value as Mode)}
              >
                <option value="none">{answerKeyCopy.none}</option>
                <option value="any">{answerKeyCopy.any}</option>
                {canListAnswers(field) || mode === 'answers' ? (
                  <option value="answers">{answerKeyCopy.answers}</option>
                ) : null}
              </select>
              {mode === 'answers' && isChoice(field) ? (
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="sr-only">{answerKeyCopy.answersFor(label)}</legend>
                  {[
                    ...field.allowedValues,
                    ...answers.filter((a) => !field.allowedValues.includes(a)),
                  ]
                    .filter(Boolean)
                    .map((value) => {
                      const checked = answers.includes(value)
                      return (
                        <ToggleRow
                          key={value}
                          checked={checked}
                          disabled={disabled || (!checked && answers.length >= maxAnswers)}
                          label={value}
                          onChange={(on) =>
                            setAnswers(
                              field.code,
                              on ? [...answers, value] : answers.filter((a) => a !== value),
                            )
                          }
                        />
                      )
                    })}
                </fieldset>
              ) : null}
              {mode === 'answers' && !isChoice(field) ? (
                <ChipListInput
                  id={`${id}-answers`}
                  noun={answerKeyCopy.answerNoun(label)}
                  values={answers}
                  max={maxAnswers}
                  maxLength={formDefinitionLimits.textLength}
                  readOnly={disabled}
                  onChange={(next) => setAnswers(field.code, next)}
                />
              ) : null}
            </div>
          )
        })
      ) : (
        <p className="text-sm text-muted-foreground">{answerKeyCopy.empty}</p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-primary">
          {answerKeyCopy.moreTitle}
        </summary>
        <p className="text-sm text-muted-foreground">{answerKeyCopy.more}</p>
      </details>
    </div>
  )
}
