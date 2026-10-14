'use client'

import { ProjectRulesPanel } from '@/features/rules/components/project-rules-panel'
import { reportsClient } from '@/lib/api/reports'
import { BudgetModule } from '../budget/components/budget-module'
import { LiveEvaluationWorkspace } from '../evaluation/components/live-evaluation-workspace'

import { FileText } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { activitiesClient } from '@/lib/api/activities'
import { projectsClient } from '@/lib/api/projects'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type {
  ActivitySummary,
  EvidenceActivitySummary,
  EvidenceList,
  EvidenceRecord,
  ProjectDetail,
} from '@/types/pathways'
import { EvidenceView, type ProjectReportRecord } from './evidence-view'

type ProjectReviewView = 'evidence' | 'monitor-evaluate' | 'budget'

export const ProjectReviewWorkspace = ({
  projectId,
  view,
}: { projectId: string; view: ProjectReviewView }) => {
  if (view === 'monitor-evaluate') return <LiveEvaluationWorkspace projectId={projectId} />
  if (view === 'budget')
    return (
      <div className="space-y-6">
        <BudgetModule projectId={projectId} />
        <ProjectRulesPanel projectId={projectId} />
      </div>
    )
  return <EvidenceWorkspace projectId={projectId} />
}
const EvidenceWorkspace = ({ projectId }: { projectId: string }) => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([])
  const [evidenceSummary, setEvidenceSummary] = useState<EvidenceActivitySummary[] | null>(null)
  const [reports, setReports] = useState<ProjectReportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [unavailableSections, setUnavailableSections] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(false)
    setUnavailableSections([])
    setActivities([])
    setEvidence([])
    setEvidenceSummary(null)
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
        const projectRecord = await projectsClient.getProject(projectId)
        if (!mounted) return
        setProject(projectRecord)
        const requests: Promise<void>[] = []
        if (canReadActivities) {
          requests.push(
            optional(
              'Connected activities',
              activitiesClient.getActivities(projectId),
              // A missing list leaves the tab usable; the budget column reads as a dash.
              (list) => setActivities(list ?? []),
            ),
          )
        }
        if (canReadEvidence) {
          requests.push(
            optional('Evidence records', activitiesClient.getEvidence(projectId), (list) =>
              applyEvidence(list, setEvidence, setEvidenceSummary),
            ),
          )
        } else {
          unavailable.push('Evidence records are not available for this role')
        }
        if (canReadReports) {
          requests.push(optional('Report records', reportsClient.reports(projectId), setReports))
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
  }, [profile, projectId, role])

  const canReviewEvidence =
    role === 'Monitoring and Evaluation Officer' &&
    canAccessProjectForRole(role, projectId, profile?.assignedProjectIds) &&
    principalHasAtomicPermission(profile, 'evidence.read') &&
    principalHasAtomicPermission(profile, 'evidence.review') &&
    principalHasAtomicPermission(profile, 'activities.read')
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
      <EvidenceView
        activities={activities}
        projectId={projectId}
        canReviewEvidence={canReviewEvidence}
        evidence={evidence}
        evidenceSummary={evidenceSummary}
        reports={reports}
      />
    </>
  )
}

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
