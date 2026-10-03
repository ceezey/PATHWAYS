'use client'
import { recipeNames } from './indicator-recipes'
import { InlineNotice, OptionSelect } from './option-select'
import { SourceMutationRecovery } from './source-mutation-recovery'
import { UseFromLibrary } from './use-from-library'

import { AsyncState } from '@/components/pathways/async-state'
import { DialogShell } from '@/components/pathways/dialog-shell'
import { EmptyState } from '@/components/pathways/empty-state'
import { ProgressBar } from '@/components/pathways/progress-bar'
import { SectionCard } from '@/components/pathways/section-card'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useMonitoringRead } from '@/features/analytics/use-monitoring-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { fingerprintOf } from '@/lib/forms/pending-create'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { indicatorLibraryClient } from '@/lib/services/indicator-library-client'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import {
  type SourceMutationResult,
  isSourceReplay,
  sourceMutationTickets,
} from '@/lib/services/source-mutation'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'
import type { Activity, DigitalFormDefinition } from '@/types/pathways'
import {
  type CreateIndicatorDraftInput as CreateIndicatorInput,
  type ManualMeasurementInput,
  type ProjectIndicator,
  createIndicatorDraftSchema,
  formatMetricCell,
  manualMeasurementSchema,
  metricRecipes,
  numericKinds,
} from '@pathways/shared'
import { Loader2, Plus, Target } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, Fragment, useCallback, useEffect, useRef, useState } from 'react'

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()
const optional = (form: FormData, name: string) => text(form, name) || undefined
const allActivities = 'ALL'
const headClass =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const authorityOptions = [
  { value: 'MANUAL', label: 'Manual measurement' },
  { value: 'DERIVED', label: 'Typed derived calculation' },
]
const directionOptions = [
  { value: 'DESCRIPTIVE', label: 'Descriptive only' },
  { value: 'HIGHER_IS_BETTER', label: 'Higher is better' },
  { value: 'LOWER_IS_BETTER', label: 'Lower is better' },
]
// Form defaults derived from the numeric domain; the API contract still receives every field.
const kindDefaults: Record<(typeof numericKinds)[number], { unit: string; precision: number }> = {
  COUNT: { unit: 'count', precision: 0 },
  SIGNED_CHANGE: { unit: 'points', precision: 1 },
  PERCENTAGE: { unit: '%', precision: 1 },
  RATIO: { unit: 'ratio', precision: 2 },
  NON_NEGATIVE: { unit: 'units', precision: 1 },
}

/** Suggests a contract-valid code from the indicator name. */
export const suggestIndicatorCode = (name: string) => {
  const code = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  if (!code) return ''
  return /^[A-Z][A-Z0-9_-]{1,39}$/.test(code) ? code : `I_${code}`.slice(0, 40)
}

const kindOptions = numericKinds.map((kind) => ({ value: kind, label: kind.replaceAll('_', ' ') }))
const recipeOptions = metricRecipes.map((value) => ({ value, label: recipeNames[value] }))

/** Shared client validation is only UX; the API repeats the same contract authoritatively. */
export function indicatorInputFromForm(
  form: FormData,
  forms: DigitalFormDefinition[],
): CreateIndicatorInput {
  const mode = text(form, 'mode')
  const recipe = text(form, 'recipe')
  const selectedForm = forms.find((item) => item.id === text(form, 'formId'))
  const formRecipe = recipe === 'FORM_NUMERIC_SUM' || recipe === 'FORM_NUMERIC_AVERAGE'
  return createIndicatorDraftSchema.parse({
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

function IndicatorForm({
  forms,
  activities,
  busy,
  message,
  onSave,
  onDone,
}: {
  forms: DigitalFormDefinition[]
  activities: Pick<Activity, 'id' | 'title' | 'journeyStageId'>[]
  busy: boolean
  message: string | null
  onSave: (input: CreateIndicatorInput) => Promise<boolean>
  onDone: () => void
}) {
  const [mode, setMode] = useState('MANUAL')
  const [name, setName] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [kind, setKind] = useState<(typeof numericKinds)[number]>('COUNT')
  const [unit, setUnit] = useState<string | null>(null)
  const [recipe, setRecipe] = useState<(typeof metricRecipes)[number]>('PARTICIPATION_RECORD_COUNT')
  const [formId, setFormId] = useState('')
  const [fieldId, setFieldId] = useState('')
  const [activityId, setActivityId] = useState(allActivities)
  const [validation, setValidation] = useState<string | null>(null)
  const selectedForm = forms.find((form) => form.id === formId)
  const numericFields =
    selectedForm?.fields.filter(
      (field) => field.id && ['INTEGER', 'DECIMAL'].includes(field.dataType),
    ) ?? []
  const formRecipe = recipe === 'FORM_NUMERIC_SUM' || recipe === 'FORM_NUMERIC_AVERAGE'
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const input = indicatorInputFromForm(new FormData(event.currentTarget), forms)
      setValidation(null)
      if (await onSave(input)) onDone()
    } catch {
      setValidation(
        'Check the period, exact decimal values, numeric domain, direction and required binding. Counts use precision 0; percentages use 0-100; ratios may exceed 1.',
      )
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={busy} className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="indicator-code">Code</label>
          <Input
            id="indicator-code"
            name="code"
            value={code ?? suggestIndicatorCode(name)}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            required
            maxLength={40}
            pattern="[A-Z][A-Z0-9_-]{1,39}"
          />
        </div>
        <div>
          <label htmlFor="indicator-name">Name</label>
          <Input
            id="indicator-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={160}
          />
        </div>
        <div>
          <label htmlFor="indicator-unit-label">Unit label</label>
          <Input
            id="indicator-unit-label"
            name="unitLabel"
            value={unit ?? kindDefaults[kind].unit}
            onChange={(event) => setUnit(event.target.value)}
            required
            maxLength={80}
            aria-describedby="indicator-unit-hint"
          />
          <p className="mt-1 text-xs text-muted-foreground" id="indicator-unit-hint">
            e.g. %, people
          </p>
        </div>
        <div>
          <label htmlFor="indicator-mode">Authority</label>
          <OptionSelect
            id="indicator-mode"
            name="mode"
            value={mode}
            onValueChange={setMode}
            options={authorityOptions}
          />
        </div>
        <div>
          <label htmlFor="indicator-kind">Numeric domain</label>
          <OptionSelect
            id="indicator-kind"
            name="numericKind"
            value={kind}
            onValueChange={(value) => setKind(value as (typeof numericKinds)[number])}
            options={kindOptions}
          />
        </div>
        <div>
          <label htmlFor="indicator-direction">Direction</label>
          <OptionSelect
            id="indicator-direction"
            name="direction"
            defaultValue="HIGHER_IS_BETTER"
            options={directionOptions}
          />
        </div>
        {kind === 'COUNT' ? <input name="displayPrecision" type="hidden" value={0} /> : null}
        <div>
          <label htmlFor="analytics-period-start">Period start</label>
          <Input id="analytics-period-start" name="periodStart" type="date" required />
        </div>
        <div>
          <label htmlFor="analytics-period-end">Period end (inclusive)</label>
          <Input id="analytics-period-end" name="periodEnd" type="date" required />
        </div>
        <div>
          <label htmlFor="baseline">Baseline</label>
          <Input
            id="baseline"
            name="baseline"
            inputMode="decimal"
            maxLength={21}
            aria-describedby="baseline-hint"
          />
          <p className="mt-1 text-xs text-muted-foreground" id="baseline-hint">
            Blank means not configured
          </p>
        </div>
        <div>
          <label htmlFor="target">Target</label>
          <Input
            id="target"
            name="target"
            inputMode="decimal"
            maxLength={21}
            aria-describedby="target-hint"
          />
          <p className="mt-1 text-xs text-muted-foreground" id="target-hint">
            Blank means not configured
          </p>
        </div>
        {kind === 'COUNT' ? null : (
          <details className="rounded-md border border-border p-3 md:col-span-2">
            <summary className="cursor-pointer text-sm font-medium">Advanced settings</summary>
            <div className="mt-3 max-w-xs">
              <label htmlFor="indicator-precision">Decimal Place</label>
              <Input
                id="indicator-precision"
                key={kind}
                name="displayPrecision"
                type="number"
                min={0}
                max={4}
                step={1}
                defaultValue={kindDefaults[kind].precision}
                required
              />
            </div>
          </details>
        )}
        <div className="md:col-span-2">
          <label htmlFor="indicator-data-source">Source description</label>
          <Textarea id="indicator-data-source" name="dataSource" required maxLength={300} />
        </div>
        {mode === 'DERIVED' ? (
          <>
            <div className="md:col-span-2">
              <label htmlFor="indicator-recipe">System-owned calculation</label>
              <OptionSelect
                id="indicator-recipe"
                name="recipe"
                value={recipe}
                onValueChange={(value) => setRecipe(value as (typeof metricRecipes)[number])}
                options={recipeOptions}
              />
            </div>
            {formRecipe ? (
              <>
                <div>
                  <label htmlFor="indicator-form">Exact published form version</label>
                  <OptionSelect
                    id="indicator-form"
                    name="formId"
                    required
                    value={formId}
                    onValueChange={(value) => {
                      setFormId(value)
                      setFieldId('')
                    }}
                    placeholder="Choose a version"
                    options={forms
                      .filter((form) => form.status === 'PUBLISHED')
                      .map((form) => ({
                        value: form.id,
                        label: `${form.name} · v${form.version}`,
                      }))}
                  />
                </div>
                <div>
                  <label htmlFor="indicator-field">Stable numeric field</label>
                  <OptionSelect
                    id="indicator-field"
                    name="fieldId"
                    required
                    value={fieldId}
                    onValueChange={setFieldId}
                    placeholder="Choose a numeric field"
                    options={numericFields.map((field) => ({
                      value: field.id as string,
                      label: `${field.label} (${field.code})`,
                    }))}
                  />
                </div>
              </>
            ) : recipe !== 'ACTIVITY_COMPLETION_PERCENTAGE' ? (
              <div>
                <label htmlFor="indicator-activity">Activity binding (optional)</label>
                <input
                  type="hidden"
                  name="activityId"
                  value={activityId === allActivities ? '' : activityId}
                />
                <OptionSelect
                  id="indicator-activity"
                  value={activityId}
                  onValueChange={setActivityId}
                  options={[
                    { value: allActivities, label: 'All permitted project activities' },
                    ...activities.map((activity) => ({
                      value: activity.id,
                      label: activity.title,
                    })),
                  ]}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </fieldset>
      {validation ? <InlineNotice tone="danger">{validation}</InlineNotice> : null}
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      <Button className="gap-2" type="submit" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {busy ? 'Saving...' : 'Save indicator'}
      </Button>
    </form>
  )
}

function NewIndicator(props: Omit<Parameters<typeof IndicatorForm>[0], 'onDone'>) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add project indicator
        </Button>
      </DialogTrigger>
      <DialogShell
        title="Add project indicator"
        description="A definition owns one reporting period and one value authority. Binding, unit, baseline, target and period are immutable after creation; use a new code for a changed contract."
      >
        <IndicatorForm {...props} onDone={() => setOpen(false)} />
      </DialogShell>
    </Dialog>
  )
}

function IndicatorEditor({
  indicator,
  busy,
  onSave,
  onUpdate,
  onArchive,
  canArchive,
}: {
  indicator: ProjectIndicator
  busy: boolean
  onSave: (input: ManualMeasurementInput) => Promise<boolean>
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
      const parsed = manualMeasurementSchema.parse({
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
    <details className="rounded-lg border border-border p-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
        Manage this indicator
      </summary>
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
              <label htmlFor={`${rowId}-value`} className="block">
                Exact value
              </label>
              <Input
                id={`${rowId}-value`}
                name="value"
                inputMode="decimal"
                maxLength={21}
                required
              />
            </div>
            <div>
              <label htmlFor={`${rowId}-source`} className="block">
                Measurement source
              </label>
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
                <label htmlFor={`${rowId}-reason`} className="block">
                  Correction reason
                </label>
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
    </details>
  )
}

export function ProjectIndicatorsWorkspace({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const createContext = useSourceMutationContext(profile, 'indicators.create', projectId, null)
  const updateContext = useSourceMutationContext(profile, 'indicators.update', projectId, null)
  const archiveContext = useSourceMutationContext(profile, 'indicators.archive', projectId, null)
  // Atomic checks under the role ceiling, never the raw grant list.
  const canCreate = principalHasAtomicPermission(profile, 'indicators.create')
  const canUpdate = principalHasAtomicPermission(profile, 'indicators.update')
  const load = useCallback(() => pathwaysClient.getProjectIndicators(projectId), [projectId])
  const { data, error, loading, reload, replaceData, authorityKey } = useMonitoringRead(
    projectId,
    load,
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [recoveryGeneration, setRecoveryGeneration] = useState(0)
  const activeKey = `${authorityKey}:${projectId}`
  const currentKey = useRef(activeKey)
  currentKey.current = activeKey
  const canReadLibrary = principalHasAtomicPermission(profile, 'indicators.library.read')
  const libraryRead = useAuthorizedRead(
    'indicator-library',
    null,
    'indicators.library.read',
    () => indicatorLibraryClient.list(),
    canCreate && canReadLibrary,
    { freshness: 'summary' },
  )
  const canReadForms = principalHasAtomicPermission(profile, 'forms.read')
  const canReadActivityContext = principalHasAtomicPermission(profile, 'activities.context.read')
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  // Binding choices need only id, title and stage: the context projection or the lean list.
  const bindingRead = useAuthorizedRead(
    'indicator-binding-choices',
    projectId,
    'indicators.create',
    async (signal) => {
      const [forms, activities] = await Promise.all([
        canReadForms
          ? pathwaysClient.getDigitalForms(projectId)
          : Promise.resolve<DigitalFormDefinition[]>([]),
        canReadActivityContext
          ? pathwaysClient.getActivityContext(projectId)
          : canReadActivities
            ? pathwaysClient.getActivities(projectId, signal)
            : Promise.resolve([]),
      ])
      return {
        forms,
        activities: activities.map(({ id, title, journeyStageId }) => ({
          id,
          title,
          journeyStageId,
        })),
      }
    },
    canCreate,
    { freshness: 'summary' },
  )
  const pendingCreate = usePendingCreate<ProjectIndicator>({
    profile,
    kind: 'project-indicator',
    projectId,
    successMessage: 'Indicator created',
    findCreated: async (fingerprint) =>
      (await pathwaysClient.getProjectIndicators(projectId)).find(
        (item) => fingerprintOf(item.code) === fingerprint,
      ),
    onConfirmed: () => reload(),
  })
  const creating = busy || pendingCreate.pending
  const mutate = async (
    action: () => Promise<SourceMutationResult<ProjectIndicator>>,
    createFingerprint?: string,
  ) => {
    if (busy) return false
    const startedKey = activeKey
    setBusy(true)
    setMessage(null)
    try {
      const result = createFingerprint
        ? await pendingCreate.submit(createFingerprint, action)
        : await action()
      if (!result) return false
      const owner = updateContext ?? createContext ?? archiveContext
      if (!owner?.isCurrent()) return false
      if (isSourceReplay(result)) {
        // The authorized reload that confirms the replay is also the displayed state.
        const persisted = await pathwaysClient.getProjectIndicators(projectId)
        if (!owner.isCurrent()) return false
        sourceMutationTickets.finishAcknowledgement(owner, result.requestId)
        if (currentKey.current === startedKey) {
          replaceData(persisted)
          setMessage('Saved. The persisted indicator is shown.')
        }
        return true
      }
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

  const availableBindings = bindingRead.data ?? null
  return (
    <section className="space-y-5">
      <SourceMutationRecovery
        context={updateContext ?? createContext ?? archiveContext}
        prefix={`/projects/${projectId}/indicators`}
        onRecovered={async () => {
          const persisted = await pathwaysClient.getProjectIndicators(projectId)
          return () => {
            setRecoveryGeneration((value) => value + 1)
            replaceData(persisted)
            setMessage('The earlier outcome is confirmed. Current indicators are shown.')
          }
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Target indicators</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Project-owned definitions, exact values and attributable corrections. No automatic
            project-success rating.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReadLibrary ? (
            <Button asChild variant="outline">
              <Link href={`/indicators/library?project=${encodeURIComponent(projectId)}`}>
                Indicator library
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={reload} disabled={loading || busy}>
            {loading ? 'Refreshing...' : 'Refresh indicators'}
          </Button>
          {canCreate && data ? (
            <NewIndicator
              key={activeKey}
              forms={availableBindings?.forms ?? []}
              activities={availableBindings?.activities ?? []}
              busy={creating}
              message={message ?? pendingCreate.notice}
              onSave={(input) =>
                mutate(
                  () =>
                    pathwaysClient.createProjectIndicator(
                      projectId,
                      input,
                      createContext ?? undefined,
                    ),
                  fingerprintOf(input.code),
                )
              }
            />
          ) : null}
        </div>
      </header>
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      {canCreate && data && libraryRead.data?.length ? (
        <UseFromLibrary
          entries={libraryRead.data}
          busy={creating}
          onUse={(input) =>
            mutate(
              () =>
                pathwaysClient.createProjectIndicatorFromLibrary(
                  projectId,
                  input,
                  createContext ?? undefined,
                ),
              fingerprintOf(
                libraryRead.data?.find((entry) => entry.id === input.libraryEntryId)?.code,
              ),
            )
          }
        />
      ) : null}
      {canCreate && data && !availableBindings ? (
        <InlineNotice>
          Binding choices could not be loaded yet. Manual definitions remain available; do not guess
          form or activity identifiers.
        </InlineNotice>
      ) : null}
      {error ? (
        <AsyncState
          status="error"
          title="Indicators unavailable"
          description={error}
          onRetry={reload}
        />
      ) : !data ? (
        <AsyncState
          status="loading"
          title="Loading verified indicators"
          description="Verifying current project scope."
        />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No indicators configured"
          description="An authorized Monitoring and Evaluation Officer can add this project's first indicator."
        />
      ) : (
        <SectionCard
          title="Indicators"
          description={`${data.length} ${data.length === 1 ? 'indicator' : 'indicators'} · definition, exact values and progress toward configured change`}
        >
          <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[880px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  <th className={headClass}>Code</th>
                  <th className={headClass}>Indicator</th>
                  <th className={headClass}>Baseline</th>
                  <th className={headClass}>Target</th>
                  <th className={headClass}>Latest value</th>
                  <th className={headClass}>Progress</th>
                  <th className={headClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((indicator) => {
                  const progress = indicator.progress.value
                  const progressText = `Progress toward configured change: ${formatMetricCell(indicator.progress)}${progress !== null ? '%' : ''}`
                  return (
                    <Fragment key={indicator.id}>
                      <tr
                        aria-label={`Indicator: ${indicator.name}`}
                        className="border-b border-border align-top hover:bg-muted"
                      >
                        <td className="px-4 py-3 text-muted-foreground">{indicator.code}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{indicator.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {indicator.periodStart ?? 'Unspecified'} to{' '}
                            {indicator.periodEnd ?? 'Unspecified'} ·{' '}
                            {indicator.unitLabel ?? 'Unit not configured'} ·{' '}
                            {indicator.mode ?? 'Legacy authority not reviewed'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Definition source: {indicator.dataSource ?? 'Not configured'}
                            {indicator.binding ? ` · ${recipeNames[indicator.binding.recipe]}` : ''}
                          </p>
                          {indicator.measurementSource ? (
                            <p className="text-xs text-muted-foreground">
                              Measurement source: {indicator.measurementSource}
                            </p>
                          ) : null}
                          {indicator.measuredAt ? (
                            <p className="text-xs text-muted-foreground">
                              Measurement recorded: {indicator.measuredAt}
                            </p>
                          ) : null}
                          {indicator.current.reason ? (
                            <p className="text-xs">
                              {indicator.current.reason.replaceAll('_', ' ')}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{indicator.baseline ?? 'Not configured'}</td>
                        <td className="px-4 py-3">{indicator.target ?? 'Not configured'}</td>
                        <td className="px-4 py-3">{formatMetricCell(indicator.current)}</td>
                        <td className="min-w-32 px-4 py-3">
                          {progress !== null ? (
                            <ProgressBar value={Number(progress)} label={progressText} hideText />
                          ) : (
                            <span className="text-muted-foreground">{progressText}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={indicator.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {indicator.status.replaceAll('_', ' ')}
                          </StatusBadge>
                        </td>
                      </tr>
                      {canUpdate && indicator.status === 'ACTIVE' ? (
                        <tr className="border-b border-border last:border-0">
                          <td colSpan={7} className="px-4 py-2">
                            <IndicatorEditor
                              key={`${indicator.id}:${indicator.revision}:${indicator.measurementId ?? 'first'}:${recoveryGeneration}`}
                              indicator={indicator}
                              busy={busy}
                              onSave={(input) =>
                                mutate(() =>
                                  pathwaysClient.recordIndicatorMeasurement(
                                    projectId,
                                    indicator.id,
                                    input,
                                    updateContext ?? undefined,
                                  ),
                                )
                              }
                              onUpdate={(name, description) =>
                                mutate(() =>
                                  pathwaysClient.updateProjectIndicator(
                                    projectId,
                                    indicator.id,
                                    {
                                      name,
                                      description,
                                      expectedRevision: indicator.revision,
                                    },
                                    updateContext ?? undefined,
                                  ),
                                )
                              }
                              canArchive={principalHasAtomicPermission(
                                profile,
                                'indicators.archive',
                              )}
                              onArchive={() =>
                                mutate(() =>
                                  pathwaysClient.archiveProjectIndicator(
                                    projectId,
                                    indicator.id,
                                    indicator.revision,
                                    archiveContext ?? undefined,
                                  ),
                                )
                              }
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </section>
  )
}
