'use client'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useMonitoringRead } from '@/features/analytics/use-monitoring-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity, DigitalFormDefinition } from '@/types/pathways'
import {
  type CreateIndicatorInput,
  type ManualMeasurementInput,
  type MonitoringIndicator,
  createIndicatorSchema,
  formatMetricCell,
  manualMeasurementSchema,
  metricRecipes,
  numericKinds,
} from '@pathways/shared'
import { Target } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
const recipeNames: Record<(typeof metricRecipes)[number], string> = {
  PARTICIPATION_RECORD_COUNT: 'Committed participation records',
  DISTINCT_ATTENDING_INDIVIDUALS: 'Distinct attending individuals',
  ATTENDANCE_RECORDS_PER_INDIVIDUAL: 'Attendance records per individual',
  EFFECTIVE_JOURNEY_EVENT_COUNT: 'Effective journey events',
  FORM_NUMERIC_SUM: 'Validated form numeric sum',
  FORM_NUMERIC_AVERAGE: 'Validated form numeric average',
  ACTIVITY_COMPLETION_PERCENTAGE: 'Activity completion percentage',
}
const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()
const optional = (form: FormData, name: string) => text(form, name) || undefined

/** Shared client validation is only UX; the API repeats the same contract authoritatively. */
export function indicatorInputFromForm(
  form: FormData,
  forms: DigitalFormDefinition[],
): CreateIndicatorInput {
  const mode = text(form, 'mode')
  const recipe = text(form, 'recipe')
  const selectedForm = forms.find((item) => item.id === text(form, 'formId'))
  const formRecipe = recipe === 'FORM_NUMERIC_SUM' || recipe === 'FORM_NUMERIC_AVERAGE'
  return createIndicatorSchema.parse({
    code: text(form, 'code'),
    name: text(form, 'name'),
    description: optional(form, 'description'),
    unitLabel: text(form, 'unitLabel'),
    dataSource: text(form, 'dataSource'),
    mode,
    numericKind: text(form, 'numericKind'),
    direction: text(form, 'direction'),
    displayPrecision: Number(text(form, 'displayPrecision')),
    periodStart: text(form, 'periodStart'),
    periodEnd: text(form, 'periodEnd'),
    baseline: text(form, 'baseline') || null,
    target: text(form, 'target') || null,
    ...(mode === 'DERIVED'
      ? {
          binding: {
            recipe,
            ...(formRecipe
              ? {
                  formId: selectedForm?.id,
                  formVersion: selectedForm?.version,
                  fieldId: optional(form, 'fieldId'),
                }
              : { activityId: optional(form, 'activityId') }),
          },
        }
      : {}),
  })
}

function NewIndicator({
  forms,
  activities,
  busy,
  onSave,
}: {
  forms: DigitalFormDefinition[]
  activities: Activity[]
  busy: boolean
  onSave: (input: CreateIndicatorInput) => Promise<boolean>
}) {
  const [mode, setMode] = useState('MANUAL')
  const [recipe, setRecipe] = useState<(typeof metricRecipes)[number]>('PARTICIPATION_RECORD_COUNT')
  const [formId, setFormId] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const selectedForm = forms.find((form) => form.id === formId)
  const numericFields =
    selectedForm?.fields.filter(
      (field) => field.id && ['INTEGER', 'DECIMAL'].includes(field.dataType),
    ) ?? []
  const formRecipe = recipe === 'FORM_NUMERIC_SUM' || recipe === 'FORM_NUMERIC_AVERAGE'
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    try {
      const input = indicatorInputFromForm(new FormData(element), forms)
      setValidation(null)
      if (await onSave(input)) {
        element.reset()
        setMode('MANUAL')
        setFormId('')
      }
    } catch {
      setValidation(
        'Check the period, exact decimal values, numeric domain, direction and required binding. Counts use precision 0; percentages use 0–100; ratios may exceed 1.',
      )
    }
  }
  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Add project indicator</summary>
      <p className="my-3 text-sm text-muted-foreground">
        A definition owns one reporting period and one value authority. Binding, unit, baseline,
        target and period are immutable after creation; use a new code for a changed contract.
      </p>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="indicator-code">Code</label>
            <Input
              id="indicator-code"
              name="code"
              required
              maxLength={40}
              pattern="[A-Z][A-Z0-9_-]{1,39}"
            />
          </div>
          <div>
            <label htmlFor="indicator-name">Name</label>
            <Input id="indicator-name" name="name" required maxLength={160} />
          </div>
          <div>
            <label htmlFor="indicator-unit-label">Unit label</label>
            <Input id="indicator-unit-label" name="unitLabel" required maxLength={80} />
          </div>

          <div>
            <label htmlFor="indicator-data-source">Source description</label>
            <Input id="indicator-data-source" name="dataSource" required maxLength={300} />
          </div>
          <label>
            Authority
            <select
              className={inputClass}
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="MANUAL">Manual measurement</option>
              <option value="DERIVED">Typed derived calculation</option>
            </select>
          </label>
          <label>
            Numeric domain
            <select className={inputClass} name="numericKind" defaultValue="COUNT">
              {numericKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction
            <select className={inputClass} name="direction" defaultValue="DESCRIPTIVE">
              <option value="DESCRIPTIVE">Descriptive only</option>
              <option value="HIGHER_IS_BETTER">Higher is better</option>
              <option value="LOWER_IS_BETTER">Lower is better</option>
            </select>
          </label>
          <div>
            <label htmlFor="displayDirectionPrecision">Chart-axis decimal places</label>
            <Input
              id="displayDirectionPrecision"
              name="displayPrecision"
              type="number"
              min={0}
              max={4}
              step={1}
              defaultValue={0}
              required
            />
          </div>
          <div>
            <label htmlFor="analytics-period-start">Period start</label>
            <Input id="analytics-period-start" name="periodStart" type="date" required />
          </div>
          <div>
            <label htmlFor="analytics-period-end">Period end (inclusive)</label>
            <Input id="analytics-period-end" name="periodEnd" type="date" required />
          </div>
          <div>
            <label htmlFor="baseline">Baseline (blank means not configured)</label>
            <Input id="baseline" name="baseline" inputMode="decimal" maxLength={21} />
          </div>
          <div>
            <label htmlFor="target">Target (blank means not configured)</label>
            <Input id="target" name="target" inputMode="decimal" maxLength={21} />
          </div>
          <label className="md:col-span-2">
            Description
            <textarea className={inputClass} name="description" maxLength={2000} />
          </label>
          {mode === 'DERIVED' ? (
            <>
              <label className="md:col-span-2">
                System-owned calculation
                <select
                  className={inputClass}
                  name="recipe"
                  value={recipe}
                  onChange={(event) =>
                    setRecipe(event.target.value as (typeof metricRecipes)[number])
                  }
                >
                  {metricRecipes.map((value) => (
                    <option key={value} value={value}>
                      {recipeNames[value]}
                    </option>
                  ))}
                </select>
              </label>
              {formRecipe ? (
                <>
                  <label>
                    Exact published form version
                    <select
                      name="formId"
                      className={inputClass}
                      value={formId}
                      onChange={(event) => setFormId(event.target.value)}
                      required
                    >
                      <option value="">Choose a version</option>
                      {forms
                        .filter((form) => form.status === 'PUBLISHED')
                        .map((form) => (
                          <option key={form.id} value={form.id}>
                            {form.name} · v{form.version}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Stable numeric field
                    <select
                      key={formId}
                      className={inputClass}
                      name="fieldId"
                      required
                      defaultValue=""
                    >
                      <option value="">Choose a numeric field</option>
                      {numericFields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label} ({field.code})
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : recipe !== 'ACTIVITY_COMPLETION_PERCENTAGE' ? (
                <label>
                  Activity binding (optional)
                  <select className={inputClass} name="activityId" defaultValue="">
                    <option value="">All permitted project activities</option>
                    {activities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
        </fieldset>
        {validation ? (
          <p role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        ) : null}
        <Button type="submit" disabled={busy}>
          Save indicator
        </Button>
      </form>
    </details>
  )
}

function IndicatorEditor({
  indicator,
  busy,
  onSave,
  onUpdate,
  onArchive,
}: {
  indicator: MonitoringIndicator
  busy: boolean
  onSave: (input: ManualMeasurementInput) => Promise<boolean>
  onUpdate: (name: string, description: string) => Promise<boolean>
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
      if (retry.current?.signature !== signature)
        retry.current = { signature, id: crypto.randomUUID() }
      const parsed = manualMeasurementSchema.parse({
        ...payload,
        clientMeasurementId: retry.current.id,
      })
      setError(null)
      if (await onSave(parsed)) {
        retry.current = null
        element.reset()
      }
    } catch {
      setError('Enter an exact decimal, a source and a correction reason when replacing a value.')
    }
  }
  return (
    <details className="mt-4 rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Manage this indicator</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          await onUpdate(text(data, 'name'), text(data, 'description'))
        }}
      >
        <fieldset disabled={busy} className="space-y-2">
          <div>
            <label htmlFor="name">Name</label>
            <Input id="name" name="name" defaultValue={indicator.name} maxLength={160} required />
          </div>
          <label className="block">
            Description
            <textarea
              className={inputClass}
              name="description"
              defaultValue={indicator.description ?? ''}
              maxLength={2000}
            />
          </label>
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
              <label htmlFor="value" className="block">
                Exact value
              </label>
              <Input id="value" name="value" inputMode="decimal" maxLength={21} required />
            </div>
            <div>
              <label htmlFor="source" className="block">
                Measurement source
              </label>
              <Input id="source" name="source" maxLength={300} required />
            </div>
            <div>
              <label htmlFor="note" className="block">
                Note
              </label>
              <Input id="note" name="note" maxLength={1000} />
            </div>

            {indicator.measurementId ? (
              <div>
                <label htmlFor="reason" className="block">
                  Correction reason
                </label>
                <Input id="reason" name="reason" maxLength={1000} required />
              </div>
            ) : null}
            <Button type="submit">Save measurement</Button>
          </fieldset>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Derived values are read from their pinned operational source; manual entry is not
          permitted.
        </p>
      )}
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
    </details>
  )
}

export function ProjectIndicatorsWorkspace({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const canCreate = profile?.permissions.includes('indicators.create') === true
  const canUpdate = profile?.permissions.includes('indicators.update') === true
  const load = useCallback(() => pathwaysClient.getProjectIndicators(projectId), [projectId])
  const { data, error, loading, reload, authorityKey } = useMonitoringRead(projectId, load)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [bindings, setBindings] = useState<{
    key: string
    forms: DigitalFormDefinition[]
    activities: Activity[]
  } | null>(null)
  const activeKey = `${authorityKey}:${projectId}`
  const currentKey = useRef(activeKey)
  currentKey.current = activeKey
  useEffect(() => {
    let active = true
    if (canCreate)
      void Promise.all([
        pathwaysClient.getDigitalForms(projectId),
        pathwaysClient.getActivities(projectId),
      ])
        .then(([forms, activities]) => {
          if (active) setBindings({ key: activeKey, forms, activities })
        })
        .catch(() => {
          if (active) setBindings(null)
        })
    return () => {
      active = false
    }
  }, [activeKey, canCreate, projectId])
  const mutate = async (action: () => Promise<MonitoringIndicator>) => {
    if (busy) return false
    const startedKey = activeKey
    setBusy(true)
    setMessage(null)
    try {
      await action()
      if (currentKey.current === startedKey) {
        reload()
        setMessage('Saved. The persisted indicator is being reloaded.')
      }
      return true
    } catch (failure) {
      if (currentKey.current === startedKey) {
        setMessage(
          failure instanceof PathwaysClientError
            ? failure.message
            : 'Save could not be confirmed. Reload or retry the same measurement before changing it.',
        )
        reload()
      }
      return false
    } finally {
      if (currentKey.current === startedKey) setBusy(false)
    }
  }

  const lastResetKey = useRef(activeKey)

  useEffect(() => {
    if (lastResetKey.current === activeKey) return

    lastResetKey.current = activeKey
    setBusy(false)
    setMessage(null)
  }, [activeKey])

  const availableBindings = bindings?.key === activeKey ? bindings : null
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Target indicators</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Project-owned definitions, exact values and attributable corrections. No automatic
            project-success rating.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={reload} disabled={loading || busy}>
          {loading ? 'Refreshing…' : 'Refresh indicators'}
        </Button>
      </header>
      {message ? (
        <output aria-live="polite" className="block rounded-md border border-border p-3 text-sm">
          {message}
        </output>
      ) : null}
      {canCreate && data ? (
        <NewIndicator
          key={activeKey}
          forms={availableBindings?.forms ?? []}
          activities={availableBindings?.activities ?? []}
          busy={busy}
          onSave={(input) => mutate(() => pathwaysClient.createProjectIndicator(projectId, input))}
        />
      ) : null}
      {canCreate && data && !availableBindings ? (
        <p className="text-sm text-muted-foreground">
          Binding choices could not be loaded yet. Manual definitions remain available; do not guess
          form or activity identifiers.
        </p>
      ) : null}
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <output aria-live="polite">Loading verified indicators…</output>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No indicators configured"
          description="An authorized Monitoring and Evaluation Officer can add this project's first indicator."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.map((indicator) => (
            <Card key={indicator.id}>
              <CardHeader>
                <CardTitle>{indicator.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {indicator.code} · {indicator.status.replaceAll('_', ' ')} ·{' '}
                  {indicator.mode ?? 'Legacy authority not reviewed'}
                </p>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm">
                  {indicator.periodStart ?? 'Unspecified'} to {indicator.periodEnd ?? 'Unspecified'}{' '}
                  · {indicator.unitLabel ?? 'Unit not configured'}
                </p>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Baseline</dt>
                    <dd>{indicator.baseline ?? 'Not configured'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd>{indicator.target ?? 'Not configured'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Current measurement</dt>
                    <dd>{formatMetricCell(indicator.current)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm">
                  Progress toward configured change: {formatMetricCell(indicator.progress)}
                  {indicator.progress.value !== null ? '%' : ''}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Definition source: {indicator.dataSource ?? 'Not configured'}
                  {indicator.binding ? ` · ${recipeNames[indicator.binding.recipe]}` : ''}
                </p>
                {indicator.measurementSource ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Measurement source: {indicator.measurementSource}
                  </p>
                ) : null}
                {indicator.measuredAt ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Measurement recorded: {indicator.measuredAt}
                  </p>
                ) : null}
                {indicator.current.reason ? (
                  <p className="mt-2 text-xs">{indicator.current.reason.replaceAll('_', ' ')}</p>
                ) : null}
                {canUpdate && indicator.status === 'ACTIVE' ? (
                  <IndicatorEditor
                    key={`${indicator.id}:${indicator.revision}:${indicator.measurementId ?? 'first'}`}
                    indicator={indicator}
                    busy={busy}
                    onSave={(input) =>
                      mutate(() =>
                        pathwaysClient.recordIndicatorMeasurement(projectId, indicator.id, input),
                      )
                    }
                    onUpdate={(name, description) =>
                      mutate(() =>
                        pathwaysClient.updateProjectIndicator(projectId, indicator.id, {
                          name,
                          description,
                          expectedRevision: indicator.revision,
                        }),
                      )
                    }
                    onArchive={() =>
                      mutate(() =>
                        pathwaysClient.archiveProjectIndicator(
                          projectId,
                          indicator.id,
                          indicator.revision,
                        ),
                      )
                    }
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
