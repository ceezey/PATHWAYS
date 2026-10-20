'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  type RuleExpectations,
  SEVERITY_MISSING_TEXT,
  ruleExpectationsSchema,
  severityLabel,
} from '@pathways/shared'
import { useId } from 'react'
import { explainCombination, explainConditions, explanatorySubject } from '../rule-severity.explain'
import type { SeverityPreview as Preview } from '../rule-severity.utils'
import { severityStepCopy as copy, severityTiles } from '../rules.copy'
import type { Leaf } from '../rules.utils'

type Props = {
  preview: Preview
  conditions: Leaf[]
  critical: boolean
  onCritical: (value: boolean) => void
  expectations: RuleExpectations
  onExpectations: (value: RuleExpectations) => void
  showScore: boolean
  showFollowUp: boolean
}
const listed = (labels: string[]) =>
  labels.length < 3 ? labels.join(' or ') : `${labels.slice(0, -1).join(', ')}, or ${labels.at(-1)}`
const headline = (preview: Preview) => {
  if (preview.contradiction) return preview.contradiction
  if (preview.explanatoryOnly) return copy.explanatory
  if (!preview.levels.length) return copy.incomplete
  return `Possible levels: ${listed(preview.levels.map(severityLabel))}.`
}
const tileBase = 'rounded-md border p-3 text-left text-sm'
const idle = 'border-input bg-card text-muted-foreground'

/** Step 3 severity tiles, how each condition raises the level, and the expectations severity compares with. */
export function SeverityPreview(props: Props) {
  const { preview, critical, onCritical, expectations, onExpectations } = props
  const id = useId()
  const explained = explainConditions(props.conditions, expectations)
  const notes = explainCombination(props.conditions)
  const possible = !preview.contradiction && !preview.explanatoryOnly
  const subject = explanatorySubject(props.conditions)
  const details = [
    ...(preview.dependsOnDates && !preview.contradiction ? [copy.dates] : []),
    ...(preview.explanatoryOnly
      ? [copy.notBehind(subject), copy.howToLevel]
      : preview.needs.map((need) =>
          need === 'DELIVERY_EXPECTATION'
            ? copy.partlyExplanatory(subject)
            : SEVERITY_MISSING_TEXT[need],
        )),
  ]
  const title = cn('font-medium', preview.contradiction && 'text-danger')
  const field = (key: keyof RuleExpectations, label: string, hint: string) => {
    const value = expectations[key] ?? ''
    const invalid =
      value.trim() !== '' && !ruleExpectationsSchema.safeParse({ [key]: value.trim() }).success
    return (
      <div className="space-y-2">
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        <Input
          aria-describedby={`${id}-${key}-hint${invalid ? ` ${id}-${key}-error` : ''}`}
          aria-invalid={invalid || undefined}
          id={`${id}-${key}`}
          inputMode="decimal"
          maxLength={20}
          value={value}
          onChange={(event) => onExpectations({ ...expectations, [key]: event.target.value })}
        />
        <p className="text-sm text-muted-foreground" id={`${id}-${key}-hint`}>
          {hint}
        </p>
        {invalid ? (
          <p className="text-sm text-danger" id={`${id}-${key}-error`}>
            Use a value from 0 to 100.
          </p>
        ) : null}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {severityTiles.map((item) => {
          const body = (
            <>
              <span className="block font-medium">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.hint}</span>
            </>
          )
          if (item.level === 'CRITICAL')
            return (
              <button
                aria-pressed={critical}
                className={cn(
                  tileBase,
                  'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  critical ? cn(item.tile, 'font-semibold') : idle,
                )}
                key={item.level}
                type="button"
                onClick={() => onCritical(!critical)}
              >
                {body}
              </button>
            )
          const lit = possible && preview.levels.includes(item.level)
          return (
            <div
              aria-disabled="true"
              className={cn(tileBase, lit ? item.tile : idle)}
              data-lit={lit}
              data-testid={`severity-tile-${item.level}`}
              key={item.level}
            >
              {body}
              <span className="sr-only">{lit ? 'Possible level' : 'Not a possible level'}</span>
            </div>
          )
        })}
      </div>
      <p className="px-3 text-sm leading-5 text-muted-foreground">{copy.criticalNote}</p>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="rounded-md border border-info/30 bg-info-subtle p-3 text-sm"
        data-testid="severity-preview"
      >
        {details.length ? (
          <details>
            <summary className={cn(title, 'cursor-pointer')} data-testid="severity-preview-levels">
              {headline(preview)}
            </summary>
            <div className="mt-2 space-y-1">
              {details.map((text) => (
                <p className="text-muted-foreground" key={text}>
                  {text}
                </p>
              ))}
            </div>
          </details>
        ) : (
          <p className={title} data-testid="severity-preview-levels">
            {headline(preview)}
          </p>
        )}
      </div>
      {explained.length ? (
        <div className="space-y-2 text-sm" data-testid="severity-explanations">
          <p className="font-medium">{copy.howRaised}</p>
          <ul className="space-y-2">
            {explained.map((item) => (
              <li key={item.id}>
                <span className="font-medium">{item.condition}:</span> {item.text}
              </li>
            ))}
          </ul>
          {notes.map((note) => (
            <p className="text-muted-foreground" key={note}>
              {note}
            </p>
          ))}
        </div>
      ) : null}
      {props.showScore || props.showFollowUp ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {props.showScore
            ? field(
                'expectedScoreImprovement',
                'Expected score improvement',
                'Points the assessment average should improve, 0 to 100, as agreed by managers.',
              )
            : null}
          {props.showFollowUp
            ? field(
                'manageableFollowUpPercent',
                'Manageable follow-up level',
                'Percent of the group needing follow-up that managers agree is manageable, 0 to 100.',
              )
            : null}
        </div>
      ) : null}
    </div>
  )
}
