'use client'

import {
  ArrowLeft,
  CalendarClock,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, FilterBar, ProgressBar, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type {
  Activity,
  ActivityStatus,
  Indicator,
  ProjectDetail,
  UserRecord,
} from '@/types/pathways'

import { ActivityDetailPanel } from './activity-detail-panel'
import { ActivityFormDialog } from './activity-form-dialog'
import { ActivityProofDialog } from './activity-proof-dialog'
import {
  type ActivityFilter,
  activityFilters,
  activityStatusTone,
  activityStatuses,
  formatCurrency,
  formatDate,
} from './activity-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'

const projectOfficerName = 'Project Officer A'

const indicatorSummary = (activity: Activity, indicators: Indicator[]) =>
  activity.indicatorIds
    .map(
      (indicatorId) =>
        indicators.find((indicator) => indicator.id === indicatorId)?.code ?? indicatorId,
    )
    .join(', ')

const attentionActivity = (activity: Activity) =>
  activity.status === 'Overdue' || activity.status === 'For Review' || activity.progress < 50

const matchesFilter = (activity: Activity, filter: ActivityFilter) => {
  if (filter === 'Mine') {
    return activity.assignedTo.includes(projectOfficerName)
  }

  if (filter === 'Overdue') {
    return activity.status === 'Overdue'
  }

  if (filter === 'Needs Attention') {
    return attentionActivity(activity)
  }

  return true
}

const ActivityCard = ({
  activity,
  indicators,
  onOpen,
}: {
  activity: Activity
  indicators: Indicator[]
  onOpen: (activity: Activity) => void
}) => (
  <article className="min-w-0 rounded-lg border border-border bg-background p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words text-sm font-semibold leading-6 text-foreground">
          {activity.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {activity.description}
        </p>
      </div>
      <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
    </div>
    <div className="mt-4">
      <ProgressBar
        label="Progress"
        tone={
          activity.status === 'Overdue' ? 'danger' : activity.progress >= 80 ? 'success' : 'info'
        }
        value={activity.progress}
      />
    </div>
    <dl className="mt-4 grid gap-3 text-xs text-muted-foreground">
      <div className="flex items-start gap-2">
        <UsersRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <dt>Assigned users</dt>
          <dd className="break-words font-medium text-foreground">
            {activity.assignedTo.join(', ')}
          </dd>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <dt>Due date</dt>
          <dd className="font-medium text-foreground">{formatDate(activity.dueDate)}</dd>
        </div>
      </div>
      <div>
        <dt>Connected indicators</dt>
        <dd className="mt-1 break-words font-medium text-foreground">
          {indicatorSummary(activity, indicators) || 'No indicator linked'}
        </dd>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <dt>Target beneficiaries</dt>
          <dd className="font-medium text-foreground">{activity.targetBeneficiaries}</dd>
        </div>
        <div>
          <dt>Budget allocation</dt>
          <dd className="font-medium text-foreground">
            {formatCurrency(activity.budgetAllocation)}
          </dd>
        </div>
      </div>
    </dl>
    <div className="mt-4 flex justify-end">
      <Button
        className="gap-2"
        onClick={() => onOpen(activity)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        View
      </Button>
    </div>
  </article>
)

export const ProjectActivitiesWorkspace = ({
  initialActivityId,
  projectId,
}: {
  initialActivityId?: string
  projectId: string
}) => {
  const router = useRouter()
  const { role } = usePrototypeRole()
  const canCreateEdit = can(role, 'activities.create_edit')
  const canSubmitProof = can(role, 'activities.submit_update_proof')
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ActivityFilter>('All')
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [proofActivity, setProofActivity] = useState<Activity | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(false)

    Promise.all([
      pathwaysClient.getProject(projectId),
      pathwaysClient.getActivities(projectId),
      pathwaysClient.getIndicators(projectId),
      pathwaysClient.getUsers(),
    ])
      .then(([projectRecord, activityRecords, indicatorRecords, userRecords]) => {
        if (!mounted) {
          return
        }

        setProject(projectRecord)
        setActivities(activityRecords)
        setIndicators(indicatorRecords)
        setUsers(userRecords)
        const initialActivity = initialActivityId
          ? (activityRecords.find((activity) => activity.id === initialActivityId) ?? null)
          : null
        setSelectedActivity(initialActivity)
      })
      .catch(() => {
        if (!mounted) {
          return
        }

        setError(true)
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [initialActivityId, projectId])

  const filteredActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return activities.filter((activity) => {
      const matchesQuery = normalizedQuery
        ? [
            activity.title,
            activity.description,
            activity.assignedTo.join(' '),
            indicatorSummary(activity, indicators),
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        : true

      return matchesQuery && matchesFilter(activity, filter)
    })
  }, [activities, filter, indicators, query])

  const upsertActivity = (activity: Activity) => {
    setActivities((currentActivities) => [
      ...currentActivities.filter((item) => item.id !== activity.id),
      activity,
    ])
    setSelectedActivity(activity)
  }

  const openDetail = (activity: Activity) => {
    setSelectedActivity(activity)
    router.push(`/projects/${projectId}/activities/${activity.id}`)
  }

  const closeDetail = (open: boolean) => {
    if (open) {
      return
    }

    setSelectedActivity(null)
    router.push(`/projects/${projectId}/activities`)
  }

  const openCreate = () => {
    if (!canCreateEdit) {
      return
    }

    setEditingActivity(null)
    setFormOpen(true)
  }

  const openEdit = (activity: Activity) => {
    if (!canCreateEdit) {
      return
    }

    setEditingActivity(activity)
    setFormOpen(true)
  }

  const openProof = (activity: Activity) => {
    if (!canSubmitProof) {
      return
    }

    setProofActivity(activity)
    setProofOpen(true)
  }

  if (loading) {
    return (
      <EmptyState
        description="Loading the project workspace and activities."
        icon={Loader2}
        title="Loading activities"
      />
    )
  }

  if (error || !project) {
    return (
      <>
        <PageHeader
          eyebrow="Project workspace"
          title="Workspace unavailable"
          description="This project workspace is not available in the current prototype session."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <EmptyState
          description="Try returning to the project directory and opening another project."
          icon={LayoutGrid}
          title="No workspace data"
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Project workspace"
        title="Activity Management"
        description="Plan, review, and update prototype project activities."
        actions={
          <Button asChild className="gap-2" variant="outline">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Projects
            </Link>
          </Button>
        }
      />
      <ProjectWorkspaceHeader project={project} />
      <FilterBar>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Search activities"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search activities, officers, or indicators"
            value={query}
          />
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as ActivityFilter)}>
          <TabsList className="grid h-auto w-full grid-cols-2 md:flex md:w-auto">
            {activityFilters.map((item) => (
              <TabsTrigger key={item} value={item}>
                {item}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button
            aria-pressed={viewMode === 'board'}
            onClick={() => setViewMode('board')}
            size="icon"
            type="button"
            variant={viewMode === 'board' ? 'default' : 'outline'}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Board view</span>
          </Button>
          <Button
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            size="icon"
            type="button"
            variant={viewMode === 'list' ? 'default' : 'outline'}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">List view</span>
          </Button>
          {canCreateEdit ? (
            <Button className="gap-2" onClick={openCreate} type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Activity
            </Button>
          ) : null}
        </div>
      </FilterBar>
      {filteredActivities.length === 0 ? (
        <EmptyState
          description="Create an activity or adjust the search and filter controls."
          icon={LayoutGrid}
          title="No activities match the current view"
        />
      ) : null}
      {filteredActivities.length > 0 && viewMode === 'board' ? (
        <section className="grid gap-4 xl:grid-cols-5">
          {activityStatuses.map((status) => {
            const statusActivities = filteredActivities.filter(
              (activity) => activity.status === status,
            )

            return (
              <SectionCard
                key={status}
                title={status}
                description={`${statusActivities.length} activit${statusActivities.length === 1 ? 'y' : 'ies'}`}
                className="min-w-0"
                actions={<StatusBadge tone={activityStatusTone(status)}>{status}</StatusBadge>}
              >
                <div className="space-y-3">
                  {statusActivities.length > 0 ? (
                    statusActivities.map((activity) => (
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        indicators={indicators}
                        onOpen={openDetail}
                      />
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                      No activities in this column.
                    </p>
                  )}
                </div>
              </SectionCard>
            )
          })}
        </section>
      ) : null}
      {filteredActivities.length > 0 && viewMode === 'list' ? (
        <SectionCard title="Activity list" description="Scan all filtered activities in one view.">
          <div className="space-y-3">
            {filteredActivities.map((activity) => (
              <div
                key={activity.id}
                className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-[1.5fr_0.8fr_0.7fr_0.7fr_auto]"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{activity.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {indicatorSummary(activity, indicators) || 'No indicator linked'}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground">Assigned users</p>
                  <p className="mt-1 break-words font-medium text-foreground">
                    {activity.assignedTo.join(', ')}
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-muted-foreground">Due date</p>
                  <p className="mt-1 font-medium text-foreground">{formatDate(activity.dueDate)}</p>
                </div>
                <div className="space-y-2">
                  <StatusBadge tone={activityStatusTone(activity.status)}>
                    {activity.status}
                  </StatusBadge>
                  <ProgressBar value={activity.progress} />
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    className="gap-2"
                    onClick={() => openDetail(activity)}
                    size="sm"
                    type="button"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
      <ActivityDetailPanel
        activity={selectedActivity}
        canEdit={canCreateEdit}
        canSubmitProof={canSubmitProof}
        indicators={indicators}
        onEdit={openEdit}
        onOpenChange={closeDetail}
        onSubmitProof={openProof}
        open={Boolean(selectedActivity)}
      />
      <ActivityFormDialog
        activity={editingActivity}
        indicators={indicators}
        onCreatedOrUpdated={upsertActivity}
        onOpenChange={setFormOpen}
        open={formOpen}
        projectId={projectId}
        users={users}
      />
      <ActivityProofDialog
        activity={proofActivity}
        onOpenChange={setProofOpen}
        onSubmitted={upsertActivity}
        open={proofOpen}
      />
    </>
  )
}
