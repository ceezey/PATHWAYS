'use client'
import { InlineNotice } from '../../components/option-select'

import { MetricTooltip } from '@/components/pathways/metric-tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { metricGlossary } from '@/constants/metric-glossary'
import {
  type IndicatorResponse,
  type RecordIndicatorMeasurementRequest,
  recordIndicatorMeasurementRequest,
} from '@pathways/shared'
import { type FormEvent, useRef, useState } from 'react'
import { optional, text } from '../indicators.utils'

export function IndicatorEditor({
  indicator,
  busy,
  onSave,
  onUpdate,
  onArchive,
  canArchive,
}: {
  indicator: IndicatorResponse
  busy: boolean
  onSave: (input: RecordIndicatorMeasurementRequest) => Promise<boolean>
  onUpdate: (name: string, description: string) => Promise<boolean>
  canArchive: boolean
  onArchive: () => Promise<boolean>
}) {
  const [error, setError] = useState<string | null>(null)
  const [archiveConfirmed, setArchiveConfirmed] = useState(false)
  const retry = useRef<{ signature: string; id: string } | null>(null)
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    const data = new FormData(element)
    const payload = {
      periodStart: indicator.periodStart,
      periodEnd: indicator.periodEnd,
      value: text(data, 'value'),
      source: text(data, 'source'),
      note: optional(data, 'note'),
      ...(indicator.measurementId
        ? { correctsMeasurementId: indicator.measurementId, correctionReason: text(data, 'reason') }
        : {}),
    }
    try {
      const signature = JSON.stringify(payload)
      if (retry.current && retry.current.signature !== signature)
        throw new Error(
          'The earlier measurement outcome is unresolved. Retry its unchanged values before changing them.',
        )
      const attempt = retry.current ?? { signature, id: crypto.randomUUID() }
      const parsed = recordIndicatorMeasurementRequest.parse({
        ...payload,
        clientMeasurementId: attempt.id,
      })
      retry.current = attempt
      setError(null)
      if (await onSave(parsed)) {
        retry.current = null
        element.reset()
      }
    } catch {
      setError('Enter an exact decimal, a source and a correction reason when replacing a value.')
    }
  }
  // Each row gets its own field ids so labels target the right indicator.
  const rowId = `indicator-${indicator.id}`
  return (
    <div className="space-y-3">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          await onUpdate(text(data, 'name'), text(data, 'description'))
        }}
      >
        <fieldset disabled={busy} className="space-y-2">
          <div>
            <label htmlFor={`${rowId}-name`}>Name</label>
            <Input
              id={`${rowId}-name`}
              name="name"
              defaultValue={indicator.name}
              maxLength={160}
              required
            />
          </div>
          <div>
            <label htmlFor={`${rowId}-description`} className="block">
              Description
            </label>
            <Textarea
              id={`${rowId}-description`}
              name="description"
              defaultValue={indicator.description ?? ''}
              maxLength={2000}
            />
          </div>
          <Button type="submit" variant="outline">
            Save labels
          </Button>
        </fieldset>
      </form>
      {indicator.mode === 'MANUAL' ? (
        <form className="mt-5 space-y-3" onSubmit={save}>
          <fieldset disabled={busy} className="space-y-2">
            <legend className="font-medium">
              {indicator.measurementId ? 'Append a correction' : 'Record the first measurement'}
            </legend>
            <div>
              <span className="flex items-center gap-1">
                <label htmlFor={`${rowId}-value`}>Exact value</label>
                <MetricTooltip label="Exact value">{metricGlossary.exactValue}</MetricTooltip>
              </span>
              <Input
                id={`${rowId}-value`}
                name="value"
                inputMode="decimal"
                maxLength={21}
                required
              />
            </div>
            <div>
              <span className="flex items-center gap-1">
                <label htmlFor={`${rowId}-source`}>Measurement source</label>
                <MetricTooltip label="Measurement source">
                  {metricGlossary.measurementSource}
                </MetricTooltip>
              </span>
              <Input id={`${rowId}-source`} name="source" maxLength={300} required />
            </div>
            <div>
              <label htmlFor={`${rowId}-note`} className="block">
                Note
              </label>
              <Input id={`${rowId}-note`} name="note" maxLength={1000} />
            </div>

            {indicator.measurementId ? (
              <div>
                <span className="flex items-center gap-1">
                  <label htmlFor={`${rowId}-reason`}>Correction reason</label>
                  <MetricTooltip label="Correction reason">
                    {metricGlossary.correctionReason}
                  </MetricTooltip>
                </span>
                <Input id={`${rowId}-reason`} name="reason" maxLength={1000} required />
              </div>
            ) : null}
            <Button type="submit">Save measurement</Button>
          </fieldset>
          {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Derived values are read from their pinned operational source; manual entry is not
          permitted.
        </p>
      )}
      {canArchive ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={archiveConfirmed}
              onChange={(event) => setArchiveConfirmed(event.target.checked)}
            />
            Confirm archive (no deletion)
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!archiveConfirmed || busy}
            onClick={() => void onArchive()}
          >
            Archive indicator
          </Button>
        </div>
      ) : null}
    </div>
  )
}
