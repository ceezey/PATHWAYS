'use client'

import Link from 'next/link'

import { CappedPercent, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { coreDataClient } from '@/lib/services/core-feature-client'
import { privateProofClient } from '@/lib/services/private-proof-client'
import type { ActivitySummary, EvidenceActivitySummary, EvidenceRecord } from '@/types/pathways'
import { AuditMetadataCard, EvidenceAttachmentsCard } from '../evidence-panels'
import { PrivateProofPreview } from '../private-proof-preview'

export type ProjectReportRecord = Awaited<ReturnType<typeof coreDataClient.reports>>[number]

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

export const EvidenceView = ({
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
  reports: ProjectReportRecord[]
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
