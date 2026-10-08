'use client'

import { PublicationQueueWorkspace } from '@/features/public/publication-queue-workspace'
import { coreDataClient } from '@/lib/services/core-feature-client'
import { formatMetricCell } from '@pathways/shared'
import { BudgetModule } from './budget-module/budget-module'
import { AuditMetadataCard, EvidenceAttachmentsCard } from './evidence-panels'
import { LiveEvaluationWorkspace } from './live-evaluation-workspace'
import { ProjectRulesPanel } from './project-rules-panel'

import { FileText, Plus, Save } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  CappedPercent,
  DialogShell,
  EmptyState,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { formatCappedPercent } from '@/lib/percent'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { privateProofClient } from '@/lib/services/private-proof-client'
import type {
  ActivitySummary,
  EvidenceActivitySummary,
  EvidenceList,
  EvidenceRecord,
  ProjectDetail,
  ProjectIndicator,
} from '@/types/pathways'
import { PrivateProofPreview } from './private-proof-preview'

import { addIndicatorSchema } from './project-review-utils'

type PhaseFiveWorkspaceView =
  | 'evidence'
  | 'indicators'
  | 'monitor-evaluate'
  | 'budget'
  | 'transparency'

type LegacyWorkspaceView = Exclude<
  PhaseFiveWorkspaceView,
  'monitor-evaluate' | 'budget' | 'transparency'
>

const statusTone = (status: string) => {
  if (['Approved', 'Accepted', 'Met', 'Verified', 'Validated', 'On Track'].includes(status)) {
    return 'success'
  }

  if (['Flagged', 'Rejected', 'Critical', 'Needs Review', 'Returned'].includes(status)) {
    return 'danger'
  }

  if (['Pending', 'Pending Review', 'Warning', 'Submitted'].includes(status)) {
    return 'warning'
  }

  if (['Draft', 'Information'].includes(status)) {
    return 'info'
  }

  return 'neutral'
}

const fieldError = (message: string) =>
  toast.error('Check the form fields.', {
    description: message,
  })

const backendNotConfigured = (action: string) =>
  toast.error(`${action} is not configured.`, {
    description: 'Connect the corresponding backend service before saving this change.',
  })

const SimpleDialog = ({
  children,
  description,
  open,
  title,
  onOpenChange,
}: {
  children: ReactNode
  description: string
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogShell title={title} description={description}>
      {children}
    </DialogShell>
  </Dialog>
)

type ScopedReport = Awaited<ReturnType<typeof coreDataClient.reports>>[number]
export const ProjectPhaseFiveWorkspace = ({
  projectId,
  view,
}: { projectId: string; view: PhaseFiveWorkspaceView }) => {
  if (view === 'monitor-evaluate') return <LiveEvaluationWorkspace projectId={projectId} />
  if (view === 'budget')
    return (
      <div className="space-y-6">
        <BudgetModule projectId={projectId} />
        <ProjectRulesPanel projectId={projectId} />
      </div>
    )
  if (view === 'transparency') return <PublicationQueueWorkspace initialProjectId={projectId} />
  return <LegacyProjectWorkspace projectId={projectId} view={view} />
}
const LegacyProjectWorkspace = ({
  projectId,
  view,
}: {
  projectId: string
  view: LegacyWorkspaceView
}) => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([])
  const [evidenceSummary, setEvidenceSummary] = useState<EvidenceActivitySummary[] | null>(null)
  const [indicators, setIndicators] = useState<ProjectIndicator[]>([])
  const [reports, setReports] = useState<ScopedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [unavailableSections, setUnavailableSections] = useState<string[]>([])
  const [addIndicatorOpen, setAddIndicatorOpen] = useState(false)
  const [formState, setFormState] = useState<Record<string, string>>({})

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(false)
    setUnavailableSections([])
    setActivities([])
    setEvidence([])
    setEvidenceSummary(null)
    setIndicators([])
    setReports([])

    if (!role || !profile) {
      setLoading(false)
      setError(true)
      return () => {
        mounted = false
      }
    }

    const unavailable: string[] = []
    const optional = async <T,>(label: string, request: Promise<T>, apply: (value: T) => void) => {
      try {
        const value = await request
        if (mounted) apply(value)
      } catch {
        unavailable.push(label)
      }
    }
    const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
    const canReadEvidence = principalHasAtomicPermission(profile, 'evidence.read')
    const canReadReports = principalHasAtomicPermission(profile, 'reports.read')

    const load = async () => {
      try {
        const projectRecord = await pathwaysClient.getProject(projectId)
        if (!mounted) return
        setProject(projectRecord)
        const requests: Promise<void>[] = []
        if (view === 'evidence') {
          if (canReadActivities) {
            requests.push(
              optional(
                'Connected activities',
                pathwaysClient.getActivities(projectId),
                // A missing list leaves the tab usable; the budget column reads as a dash.
                (list) => setActivities(list ?? []),
              ),
            )
          }
          if (canReadEvidence) {
            requests.push(
              optional('Evidence records', pathwaysClient.getEvidence(projectId), (list) =>
                applyEvidence(list, setEvidence, setEvidenceSummary),
              ),
            )
          } else {
            unavailable.push('Evidence records are not available for this role')
          }
          if (canReadReports) {
            requests.push(optional('Report records', coreDataClient.reports(projectId), setReports))
          }
        }
        if (view === 'indicators') {
          requests.push(
            optional(
              'Indicator records',
              pathwaysClient.getProjectIndicators(projectId),
              setIndicators,
            ),
          )
          if (canReadActivities) {
            requests.push(
              optional(
                'Connected activities',
                pathwaysClient.getActivities(projectId),
                // A missing list leaves the tab usable; the budget column reads as a dash.
                (list) => setActivities(list ?? []),
              ),
            )
          }
        }
        await Promise.all(requests)
        if (mounted) setUnavailableSections([...new Set(unavailable)])
      } catch {
        if (mounted) setError(true)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()

    return () => {
      mounted = false
    }
  }, [profile, projectId, role, view])

  const canReviewEvidence =
    role === 'Monitoring and Evaluation Officer' &&
    canAccessProjectForRole(role, projectId, profile?.assignedProjectIds) &&
    principalHasAtomicPermission(profile, 'evidence.read') &&
    principalHasAtomicPermission(profile, 'evidence.review') &&
    principalHasAtomicPermission(profile, 'activities.read')
  const canAddIndicator = principalHasAtomicPermission(profile, 'indicators.create')

  const addIndicator = () => {
    if (!canAddIndicator) {
      toast.error('Indicator configuration is not available for this role.')
      return
    }

    const result = addIndicatorSchema.safeParse(formState)

    if (!result.success) {
      fieldError(result.error.issues[0]?.message ?? 'Invalid indicator.')
      return
    }

    backendNotConfigured('Indicator creation')
  }

  if (loading) {
    return (
      <AsyncState
        description="Loading the project workspace tab."
        status="loading"
        title="Loading workspace"
      />
    )
  }

  if (error || !project) {
    return (
      <>
        <PageHeader
          eyebrow={labels.projectWorkspace}
          title="Workspace unavailable"
          description={
            role
              ? 'This project tab could not be loaded. The backend may not be configured yet.'
              : 'A verified staff identity is required before project workspace data can be loaded.'
          }
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <EmptyState
          description="Return to the project directory and open another project."
          icon={FileText}
          title="No workspace data"
        />
      </>
    )
  }

  return (
    <>
      {unavailableSections.length > 0 ? (
        <SectionCard
          title="Some information is unavailable"
          description="The authorized workspace remains available while these optional or restricted sections are omitted."
        >
          <output>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {unavailableSections.map((section) => (
                <li key={section}>{section}</li>
              ))}
            </ul>
          </output>
        </SectionCard>
      ) : null}
      {view === 'evidence' ? (
        <EvidenceView
          activities={activities}
          projectId={projectId}
          canReviewEvidence={canReviewEvidence}
          evidence={evidence}
          evidenceSummary={evidenceSummary}
          reports={reports}
        />
      ) : null}
      {view === 'indicators' ? (
        <IndicatorsView
          activities={activities}
          canAddIndicator={canAddIndicator}
          indicators={indicators}
          onAdd={() => {
            setFormState({})
            setAddIndicatorOpen(true)
          }}
        />
      ) : null}

      <SimpleDialog
        description="Define an indicator for this project. Saving requires backend configuration."
        onOpenChange={setAddIndicatorOpen}
        open={addIndicatorOpen}
        title="Add Indicator"
      >
        <div className="grid gap-4">
          <LabeledInput label="Code" name="code" value={formState.code} onChange={setFormState} />
          <LabeledInput
            label="Label"
            name="label"
            value={formState.label}
            onChange={setFormState}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <LabeledInput
              label="Baseline"
              name="baseline"
              type="number"
              value={formState.baseline}
              onChange={setFormState}
            />
            <LabeledInput
              label="Target"
              name="target"
              type="number"
              value={formState.target}
              onChange={setFormState}
            />
            <LabeledInput
              label="Actual/current value"
              name="actual"
              type="number"
              value={formState.actual}
              onChange={setFormState}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddIndicatorOpen(false)} type="button">
              Cancel
            </Button>
            <Button className="gap-2" onClick={addIndicator} type="button">
              <Save className="h-4 w-4" aria-hidden="true" />
              Add Indicator
            </Button>
          </DialogFooter>
        </div>
      </SimpleDialog>
    </>
  )
}

const LabeledInput = ({
  label,
  name,
  onChange,
  type = 'text',
  value,
}: {
  label: string
  name: string
  onChange: (value: (current: Record<string, string>) => Record<string, string>) => void
  type?: string
  value?: string
}) => (
  <div className="space-y-2">
    <Label htmlFor={name}>{label}</Label>
    <Input
      id={name}
      onChange={(event) =>
        onChange((current) => ({
          ...current,
          [name]: event.target.value,
        }))
      }
      type={type}
      value={value ?? ''}
    />
  </div>
)

function applyEvidence(
  list: EvidenceList,
  setRecords: (records: EvidenceRecord[]) => void,
  setSummary: (activities: EvidenceActivitySummary[] | null) => void,
) {
  if (list.scope === 'aggregate') {
    setRecords([])
    setSummary(list.activities)
  } else {
    setSummary(null)
    setRecords(list.records)
  }
}

/** Dash when there is no allocation to measure against, or no budget access. */
const budgetUsedText = (activity: ActivitySummary | undefined) =>
  activity?.budgetUtilization == null ? (
    '\u2014'
  ) : (
    <CappedPercent value={activity.budgetUtilization} overLabel="over budget" />
  )

const EvidenceSummaryCard = ({
  activities,
  budgets,
}: { activities: EvidenceActivitySummary[]; budgets: ActivitySummary[] }) => (
  <SectionCard
    title="Activity evidence summary"
    description="Evidence counts by activity, beside the same budget reading the activity and budget tabs show."
  >
    {activities.length > 0 ? (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium" scope="col">
                Activity
              </th>
              <th className="py-2 pr-3 text-right font-medium" scope="col">
                Total
              </th>
              <th className="py-2 pr-3 text-right font-medium" scope="col">
                Submitted
              </th>
              <th className="py-2 pr-3 text-right font-medium" scope="col">
                Approved
              </th>
              <th className="py-2 pr-3 text-right font-medium" scope="col">
                Returned
              </th>
              <th className="py-2 text-right font-medium" scope="col">
                Budget used
              </th>
            </tr>
          </thead>
          <tbody>
            {activities.map((row) => (
              <tr key={row.activityId} className="border-t border-border">
                <th className="break-words py-2 pr-3 font-medium text-foreground" scope="row">
                  {row.activityTitle}
                </th>
                <td className="py-2 pr-3 text-right tabular-nums">{row.total}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.submitted}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.approved}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.returned}</td>
                <td className="py-2 text-right tabular-nums">
                  {budgetUsedText(budgets.find((item) => item.id === row.activityId))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No evidence records are available for this project.
      </p>
    )}
  </SectionCard>
)

/** Preview then optional download through the private inspection route (CR section 6). */
const EvidenceDownloadControl = ({
  activityId,
  eligible,
  evidenceId,
  projectId,
  updateId,
}: {
  activityId: string
  eligible: boolean
  evidenceId: string
  projectId: string
  updateId: string
}) => {
  const { profile } = useCurrentRole()
  const owner = useSensitiveDraftOwner(
    profile,
    'evidence-download-control',
    'evidence.review',
    projectId,
    JSON.stringify([activityId, updateId, evidenceId]),
    eligible &&
      profile?.roles[0] === 'MONITORING_AND_EVALUATION_OFFICER' &&
      principalHasAtomicPermission(profile, 'evidence.read'),
  )

  if (!owner) {
    return (
      <Button aria-label="Not available yet" disabled size="sm" type="button" variant="outline">
        View
      </Button>
    )
  }

  return (
    <PrivateProofPreview
      ariaLabel="Preview for review"
      fetchProof={async (signal) => {
        const context = await privateProofClient.context(projectId, activityId, updateId)
        if (!owner.isCurrent()) throw new Error('Proof access changed.')
        return privateProofClient.inspect(projectId, context, evidenceId, signal)
      }}
      isCurrent={owner.isCurrent}
      label="Preview"
      title="Activity proof"
    />
  )
}

const EvidenceView = ({
  activities,
  projectId,
  canReviewEvidence,
  evidence,
  evidenceSummary,
  reports,
}: {
  activities: ActivitySummary[]
  projectId: string
  canReviewEvidence: boolean
  evidence: EvidenceRecord[]
  evidenceSummary: EvidenceActivitySummary[] | null
  reports: ScopedReport[]
}) => (
  <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
    {evidenceSummary ? (
      <EvidenceSummaryCard activities={evidenceSummary} budgets={activities} />
    ) : (
      <>
        <EvidenceAttachmentsCard
          records={evidence}
          renderActions={(record) => {
            const eligible =
              canReviewEvidence && record.projectId === projectId && record.status === 'Submitted'
            return (
              <>
                <EvidenceDownloadControl
                  activityId={record.activityId}
                  eligible={eligible}
                  evidenceId={record.id}
                  projectId={projectId}
                  updateId={record.updateId}
                />
                {eligible ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      prefetch={false}
                      href={`/projects/${encodeURIComponent(projectId)}/activities/${encodeURIComponent(record.activityId)}?review=${encodeURIComponent(record.id)}`}
                    >
                      Review proof
                    </Link>
                  </Button>
                ) : null}
              </>
            )
          }}
        />
        <AuditMetadataCard records={evidence} />
      </>
    )}
    <SectionCard className="xl:col-span-2" title="Report records">
      <div className="space-y-3">
        {reports.length > 0 ? (
          reports.map((report) => (
            <div
              key={report.id}
              className="rounded-xl border border-border bg-background p-3 text-sm"
            >
              <p className="font-medium text-foreground">{report.name}</p>
              <p className="mt-1 text-muted-foreground">
                {report.status} · {report.format ?? 'Format not set'}
              </p>
              <p className="mt-1 text-muted-foreground">
                {report.generatedAt
                  ? `Generated ${new Date(report.generatedAt).toLocaleString()}`
                  : 'Not generated'}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No report records are linked yet.</p>
        )}
      </div>
    </SectionCard>
  </section>
)

const IndicatorsView = ({
  activities,
  canAddIndicator,
  indicators,
  onAdd,
}: {
  activities: ActivitySummary[]
  canAddIndicator: boolean
  indicators: ProjectIndicator[]
  onAdd: () => void
}) => (
  <SectionCard
    title="Indicator cards"
    description="Baseline, target, actual, progress, status, and connected activity context."
    actions={
      canAddIndicator ? (
        <Button className="gap-2" onClick={onAdd} type="button">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Indicator
        </Button>
      ) : null
    }
  >
    <div className="grid gap-4 xl:grid-cols-2">
      {indicators.length > 0 ? (
        indicators.map((indicator) => (
          <div key={indicator.id} className="rounded-xl border border-border bg-background p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">{indicator.code}</p>
                <h2 className="mt-1 break-words text-lg font-semibold text-foreground">
                  {indicator.name}
                </h2>
              </div>
              <StatusBadge tone={statusTone(indicator.status)}>{indicator.status}</StatusBadge>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Baseline</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {indicator.baseline ?? 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {indicator.target ?? 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Actual/current value</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {formatMetricCell(indicator.current)}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <p>
                Progress toward configured change:{' '}
                {indicator.progress.value !== null
                  ? formatCappedPercent(indicator.progress.value)
                  : formatMetricCell(indicator.progress)}
              </p>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              Connected activities:{' '}
              <span className="font-medium text-foreground">
                {(indicator.binding?.activityId ? [indicator.binding.activityId] : [])
                  .map(
                    (activityId) =>
                      activities.find((activity) => activity.id === activityId)?.title ??
                      activityId,
                  )
                  .join(', ') || 'None linked yet'}
              </span>
            </div>
          </div>
        ))
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground xl:col-span-2">
          No indicator records are available for this project.
        </p>
      )}
    </div>
  </SectionCard>
)
