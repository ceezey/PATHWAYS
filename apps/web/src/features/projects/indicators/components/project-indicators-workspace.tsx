'use client'
import { InlineNotice } from '../../components/option-select'
import { SourceMutationRecovery } from '../../components/source-mutation-recovery'
import { useProjectRead } from '../../projects.reads'
import { UseFromLibrary } from './use-from-library'

import { AsyncState } from '@/components/pathways/async-state'
import { DialogShell } from '@/components/pathways/dialog-shell'
import { EmptyState } from '@/components/pathways/empty-state'
import { MetricTooltip } from '@/components/pathways/metric-tooltip'
import { ProgressBar } from '@/components/pathways/progress-bar'
import { SectionCard } from '@/components/pathways/section-card'
import { StatusBadge } from '@/components/pathways/status-badge'
import { stickyTableHeadClass } from '@/components/pathways/sticky-table-head'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { INDICATOR_LIBRARY_UI_ENABLED } from '@/constants/feature-flags'
import { metricGlossary } from '@/constants/metric-glossary'
import { useMonitoringRead } from '@/features/analytics/use-monitoring-read'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { activitiesClient } from '@/lib/api/activities'
import { PathwaysClientError } from '@/lib/api/core/request'
import { indicatorLibraryClient, indicatorsClient } from '@/lib/api/indicators'
import { formatCappedPercent } from '@/lib/format/percent'
import { fingerprintOf } from '@/lib/forms/pending-create'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { pathwaysClient } from '@/lib/services/pathways-client'
import {
  type SourceMutationResult,
  isSourceReplay,
  sourceMutationTickets,
} from '@/lib/services/source-mutation'
import type { DigitalFormDefinition } from '@/types/pathways'
import { type IndicatorResponse, formatMetricCell } from '@pathways/shared'
import { MoreHorizontal, Target } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { typeLabel } from '../indicators.copy'
import { indicatorPeriod } from '../indicators.utils'
import { IndicatorEditor } from './indicator-editor'
import { NewIndicator } from './indicator-form'

export function ProjectIndicatorsWorkspace({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const createContext = useSourceMutationContext(profile, 'indicators.create', projectId, null)
  const updateContext = useSourceMutationContext(profile, 'indicators.update', projectId, null)
  const archiveContext = useSourceMutationContext(profile, 'indicators.archive', projectId, null)
  // Atomic checks under the role ceiling, never the raw grant list.
  const canCreate = principalHasAtomicPermission(profile, 'indicators.create')
  const canUpdate = principalHasAtomicPermission(profile, 'indicators.update')
  const load = useCallback(() => indicatorsClient.getProjectIndicators(projectId), [projectId])
  const { data, error, loading, reload, replaceData, authorityKey } = useMonitoringRead(
    projectId,
    load,
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [recoveryGeneration, setRecoveryGeneration] = useState(0)
  const activeKey = `${authorityKey}:${projectId}`
  const [managingId, setManagingId] = useState<string | null>(null)
  const managed = data?.find((item) => item.id === managingId && item.status === 'ACTIVE')
  const projectRead = useProjectRead(projectId)
  const period = projectRead.data
    ? indicatorPeriod(projectRead.data.startDate, projectRead.data.endDate)
    : null
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
          ? activitiesClient.getActivityContext(projectId)
          : canReadActivities
            ? activitiesClient.getActivities(projectId, signal)
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
  const pendingCreate = usePendingCreate<IndicatorResponse>({
    profile,
    kind: 'project-indicator',
    projectId,
    successMessage: 'Indicator created',
    findCreated: async (fingerprint) =>
      (await indicatorsClient.getProjectIndicators(projectId)).find(
        (item) => fingerprintOf(item.code) === fingerprint,
      ),
    onConfirmed: () => reload(),
  })
  const creating = busy || pendingCreate.pending
  const mutate = async (
    action: () => Promise<SourceMutationResult<IndicatorResponse>>,
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
        const persisted = await indicatorsClient.getProjectIndicators(projectId)
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
  // Refresh and create sit in the Indicators card heading.
  const indicatorActions = (
    <>
      <Button type="button" variant="outline" onClick={reload} disabled={loading || busy}>
        {loading ? 'Refreshing...' : 'Refresh indicators'}
      </Button>
      {canCreate && data ? (
        <NewIndicator
          key={activeKey}
          forms={availableBindings?.forms ?? []}
          activities={availableBindings?.activities ?? []}
          period={period}
          existingCodes={(data ?? []).map((item) => item.code)}
          busy={creating}
          message={message ?? pendingCreate.notice}
          onSave={(input) =>
            mutate(
              () =>
                indicatorsClient.createProjectIndicator(
                  projectId,
                  input,
                  createContext ?? undefined,
                ),
              fingerprintOf(input.code),
            )
          }
        />
      ) : null}
    </>
  )
  return (
    <section className="space-y-5">
      <SourceMutationRecovery
        context={updateContext ?? createContext ?? archiveContext}
        prefix={`/projects/${projectId}/indicators`}
        onRecovered={async () => {
          const persisted = await indicatorsClient.getProjectIndicators(projectId)
          return () => {
            setRecoveryGeneration((value) => value + 1)
            replaceData(persisted)
            setMessage('The earlier outcome is confirmed. Current indicators are shown.')
          }
        }}
      />
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      {INDICATOR_LIBRARY_UI_ENABLED && canCreate && data && libraryRead.data?.length ? (
        <UseFromLibrary
          entries={libraryRead.data}
          busy={creating}
          onUse={(input) =>
            mutate(
              () =>
                indicatorsClient.createProjectIndicatorFromLibrary(
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
      <SectionCard
        title="Indicators"
        description={
          data?.length
            ? `${data.length} ${data.length === 1 ? 'indicator' : 'indicators'} · definition, exact values and progress toward configured change`
            : undefined
        }
        actions={indicatorActions}
      >
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
          <div className="max-h-[36rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[880px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${stickyTableHeadClass} w-32`}>Code</th>
                  <th className={`${stickyTableHeadClass} w-[40%]`}>Indicator</th>
                  <th className={`${stickyTableHeadClass} text-center`}>
                    Target
                    <MetricTooltip label="Target">{metricGlossary.target}</MetricTooltip>
                  </th>
                  <th className={`${stickyTableHeadClass} text-center`}>
                    Actual
                    <MetricTooltip label="Actual">{metricGlossary.actual}</MetricTooltip>
                  </th>
                  <th className={`${stickyTableHeadClass} text-center`}>
                    Status
                    <MetricTooltip label="Status">{metricGlossary.indicatorStatus}</MetricTooltip>
                  </th>
                  <th className={stickyTableHeadClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((indicator) => {
                  const progress = indicator.progress.value
                  // Product decision: only "no measurement yet" reads as 0; other unavailable states keep their label.
                  const noDataYet =
                    indicator.current.state === 'MISSING' &&
                    indicator.current.reason === 'NO_MEASUREMENT'
                  const progressText = `Progress toward configured change: ${progress !== null ? formatCappedPercent(progress) : formatMetricCell(indicator.progress)}`
                  return (
                    <Fragment key={indicator.id}>
                      <tr
                        aria-label={`Indicator: ${indicator.name}`}
                        className="border-b border-border align-middle hover:bg-muted"
                      >
                        <td className="px-4 py-3 text-muted-foreground">{indicator.code}</td>
                        <td className="min-w-48 px-4 py-3">
                          <p className="font-medium text-foreground">{indicator.name}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1">
                              <ProgressBar
                                value={Number(progress ?? 0)}
                                label={progressText}
                                hideText
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {progress !== null
                                ? formatCappedPercent(progress)
                                : noDataYet
                                  ? '0%'
                                  : formatMetricCell(indicator.progress)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {indicator.target ?? 'Not configured'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {noDataYet ? '0' : formatMetricCell(indicator.current)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={indicator.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {indicator.status.replaceAll('_', ' ')}
                          </StatusBadge>
                        </td>
                        <td className="w-12 px-2 text-right">
                          {canUpdate && indicator.status === 'ACTIVE' ? (
                            <Button
                              aria-label={`Manage ${indicator.name}`}
                              onClick={() => setManagingId(indicator.id)}
                              size="icon"
                              title="Manage indicator"
                              type="button"
                              variant="ghost"
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      <Dialog open={Boolean(managed)} onOpenChange={(open) => (open ? null : setManagingId(null))}>
        {managed ? (
          <DialogShell
            title={`Manage ${managed.name}`}
            description={`${managed.code} · ${typeLabel(managed.indicatorType)} · Source: ${managed.dataSource ?? 'Not configured'}`}
          >
            <IndicatorEditor
              key={`${managed.id}:${managed.revision}:${managed.measurementId ?? 'first'}:${recoveryGeneration}`}
              indicator={managed}
              busy={busy}
              onSave={(input) =>
                mutate(() =>
                  indicatorsClient.recordIndicatorMeasurement(
                    projectId,
                    managed.id,
                    input,
                    updateContext ?? undefined,
                  ),
                )
              }
              onUpdate={(name, description) =>
                mutate(() =>
                  indicatorsClient.updateProjectIndicator(
                    projectId,
                    managed.id,
                    {
                      name,
                      description,
                      expectedRevision: managed.revision,
                    },
                    updateContext ?? undefined,
                  ),
                )
              }
              canArchive={principalHasAtomicPermission(profile, 'indicators.archive')}
              onArchive={() =>
                mutate(() =>
                  indicatorsClient.archiveProjectIndicator(
                    projectId,
                    managed.id,
                    managed.revision,
                    archiveContext ?? undefined,
                  ),
                )
              }
            />
          </DialogShell>
        ) : null}
      </Dialog>
    </section>
  )
}
