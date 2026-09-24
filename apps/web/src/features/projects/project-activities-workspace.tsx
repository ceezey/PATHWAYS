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
import { useEffect, useMemo, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  EmptyState,
  FilterBar,
  ProgressBar,
  ResultsAnnouncement,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type {
  Activity,
  ActivityStatus,
  Indicator,
  JourneyStageConfig,
  ProjectDetail,
  UserRecord,
} from '@/types/pathways'

import { ActivityDetailPanel } from './activity-detail-panel'
import { ActivityFormDialog } from './activity-form-dialog'
import { ActivityProofDialog } from './activity-proof-dialog'
import {
  activityDueLabel,
  activityNextStep,
  activityProgressTone,
  activityStatusTone,
  activityStatuses,
} from './activity-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'

const indicatorSummary = (activity: Activity, indicators: Indicator[]) =>
  activity.indicatorIds
    .map(
      (indicatorId) =>
        indicators.find((indicator) => indicator.id === indicatorId)?.code ?? indicatorId,
    )
    .join(', ')

const ActivityCard = ({
  activity,
  onOpen,
}: {
  activity: Activity
  onOpen: (activity: Activity) => void
}) => (
  <article
    aria-label={`Activity: ${activity.title}`}
    className="flex min-w-0 flex-col rounded-sm border border-border bg-background p-4"
  >
    <div className="flex items-start justify-between gap-3">
      <h3 className="min-w-0 break-words text-base font-semibold leading-6 text-foreground">
        {activity.title}
      </h3>
      <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
    </div>
    <p
      className={`mt-3 flex items-center gap-2 text-sm font-medium ${
        activity.status === 'Overdue' ? 'text-danger' : 'text-muted-foreground'
      }`}
    >
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {activityDueLabel(activity.status, activity.dueDate)}
    </p>
    {activity.status !== 'Completed' ? (
      <div className="mt-4">
        <ProgressBar
          label="Activity progress"
          tone={activityProgressTone(activity.status, activity.progress)}
          value={activity.progress}
        />
      </div>
    ) : null}
    <dl className="mt-4 border-t border-border pt-3 text-sm">
      <div className="flex min-w-0 items-start gap-2">
        <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <dt className="text-muted-foreground">
            {activity.assignedTo.length === 1 ? 'Owner' : 'Owners'}
          </dt>
          <dd className="mt-1 break-words font-medium text-foreground">
            {activity.assignedTo.join(', ')}
          </dd>
        </div>
      </div>
    </dl>
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</p>
      <p className="mt-1 text-sm font-medium leading-5 text-foreground">
        {activityNextStep(activity.status)}
      </p>
      <Button
        className="mt-3 w-full gap-2 sm:w-auto"
        onClick={() => onOpen(activity)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        View details
      </Button>
    </div>
  </article>
)

const ActivityListRow = ({
  activity,
  onOpen,
}: {
  activity: Activity
  onOpen: (activity: Activity) => void
}) => (
  <article
    aria-label={`Activity: ${activity.title}`}
    className="grid min-w-0 gap-4 rounded-sm border border-border bg-background p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(170px,0.7fr)_minmax(180px,0.8fr)_minmax(150px,0.6fr)_auto] xl:items-center"
  >
    <div className="min-w-0">
      <h3 className="break-words text-base font-semibold leading-6 text-foreground">
        {activity.title}
      </h3>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">Next:</span>{' '}
        {activityNextStep(activity.status)}
      </p>
    </div>
    <div className="space-y-2">
      <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
      <p
        className={`flex items-start gap-2 text-sm ${
          activity.status === 'Overdue' ? 'font-medium text-danger' : 'text-muted-foreground'
        }`}
      >
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {activityDueLabel(activity.status, activity.dueDate)}
      </p>
    </div>
    <dl className="text-sm">
      <div className="flex min-w-0 items-start gap-2">
        <UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <dt className="text-muted-foreground">
            {activity.assignedTo.length === 1 ? 'Owner' : 'Owners'}
          </dt>
          <dd className="mt-1 break-words font-medium text-foreground">
            {activity.assignedTo.join(', ')}
          </dd>
        </div>
      </div>
    </dl>
    {activity.status !== 'Completed' ? (
      <ProgressBar
        label="Progress"
        tone={activityProgressTone(activity.status, activity.progress)}
        value={activity.progress}
      />
    ) : (
      <div aria-hidden="true" />
    )}
    <div className="flex md:col-span-2 md:justify-end xl:col-span-1">
      <Button
        className="w-full gap-2 sm:w-auto"
        onClick={() => onOpen(activity)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        View details
      </Button>
    </div>
  </article>
)

const ActivityStatusSummary = ({
  activeStatus,
  counts,
  onStatusChange,
}: {
  activeStatus: ActivityStatus | null
  counts: Record<ActivityStatus, number>
  onStatusChange: (status: ActivityStatus | null) => void
}) => (
  <section aria-label="Activity status filters" className="md:col-span-2">
    <div className="flex flex-wrap gap-2">
      {activityStatuses.map((status) => {
        const selected = activeStatus === status
        return (
          <button
            aria-label={`Filter activities by ${status} status, ${counts[status]} ${counts[status] === 1 ? 'activity' : 'activities'}`}
            aria-pressed={selected}
            className={`min-h-11 rounded-full transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              selected ? 'ring-2 ring-primary ring-offset-2' : 'hover:ring-2 hover:ring-primary/30'
            }`}
            key={status}
            onClick={() => onStatusChange(selected ? null : status)}
            type="button"
          >
            <StatusBadge tone={activityStatusTone(status)}>
              {status} {counts[status]}
            </StatusBadge>
          </button>
        )
      })}
    </div>
  </section>
)

export const ProjectActivitiesWorkspace = ({
  initialActivityId,
  initialProofId,
  projectId,
}: {
  initialActivityId?: string
  initialProofId?: string
  projectId: string
}) => {
  const router = useRouter()
  const { labels } = useDisplayLabels()
  const { role, assignedProjectIds } = useCurrentRole()
  const inProjectScope = role ? canAccessProjectForRole(role, projectId, assignedProjectIds) : false
  const canCreateEdit = role ? can(role, 'activities.create_edit') && inProjectScope : false
  const canSubmitProof = role
    ? can(role, 'activities.submit_update_proof') && inProjectScope
    : false
  const canLogExpense = role === 'Project Officer' && inProjectScope
  const canValidateProof = role === 'Monitoring and Evaluation Officer' && inProjectScope
  const canDecideProof = role === 'Project Manager' && inProjectScope
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [journeyStages, setJourneyStages] = useState<JourneyStageConfig[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'none' | 'not-found' | 'error'>('none')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ActivityStatus | null>(null)
  const [viewMode, setViewMode] = useState<'board' | 'list'>('list')
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const activityDetailTrigger = useRef<HTMLElement | null>(null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [proofActivity, setProofActivity] = useState<Activity | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    let mounted = true
    setLoading(true)
    setLoadError('none')

    Promise.all([
      pathwaysClient.getProject(projectId),
      pathwaysClient.getActivities(projectId),
      pathwaysClient.getIndicators(projectId),
      pathwaysClient.getJourneyStages(projectId),
      pathwaysClient.getUsers(),
    ])
      .then(([projectRecord, activityRecords, indicatorRecords, stageRecords, userRecords]) => {
        if (!mounted) {
          return
        }

        setProject(projectRecord)
        setActivities(activityRecords)
        setIndicators(indicatorRecords)
        setJourneyStages(stageRecords)
        setUsers(userRecords)
        const initialActivity = initialActivityId
          ? (activityRecords.find((activity) => activity.id === initialActivityId) ?? null)
          : null
        setSelectedActivity(initialActivity)

        if (initialActivityId && !initialActivity) {
          router.replace(`/projects/${projectId}/activities`)
        }
      })
      .catch((error) => {
        if (!mounted) {
          return
        }

        setLoadError(
          error instanceof PathwaysClientError && error.code === 'not_found'
            ? 'not-found'
            : 'error',
        )
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [initialActivityId, loadAttempt, projectId, router])

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

      const matchesStatus = statusFilter ? activity.status === statusFilter : true
      return matchesQuery && matchesStatus
    })
  }, [activities, indicators, query, statusFilter])

  const activityStatusCounts = useMemo(() => {
    const counts: Record<ActivityStatus, number> = {
      Planned: 0,
      'In Progress': 0,
      'For Review': 0,
      Overdue: 0,
      Completed: 0,
      Cancelled: 0,
    }

    for (const activity of activities) {
      counts[activity.status] += 1
    }

    return counts
  }, [activities])

  const filteredActivityStatusCounts = useMemo(() => {
    const counts: Record<ActivityStatus, number> = {
      Planned: 0,
      'In Progress': 0,
      'For Review': 0,
      Overdue: 0,
      Completed: 0,
      Cancelled: 0,
    }

    for (const activity of filteredActivities) {
      counts[activity.status] += 1
    }

    return counts
  }, [filteredActivities])

  const visibleActivityStatuses = useMemo(
    () => activityStatuses.filter((status) => filteredActivityStatusCounts[status] > 0),
    [filteredActivityStatusCounts],
  )

  const upsertActivity = (activity: Activity, selectActivity = true) => {
    setActivities((currentActivities) => [
      ...currentActivities.filter((item) => item.id !== activity.id),
      activity,
    ])
    setSelectedActivity((currentActivity) =>
      currentActivity?.id === activity.id || selectActivity ? activity : currentActivity,
    )
  }

  const openDetail = (activity: Activity) => {
    activityDetailTrigger.current = document.activeElement as HTMLElement | null
    setSelectedActivity(activity)
    window.history.pushState(null, '', `/projects/${projectId}/activities/${activity.id}`)
  }

  const closeDetail = (open: boolean) => {
    if (open) {
      return
    }

    setSelectedActivity(null)
    window.history.replaceState(null, '', `/projects/${projectId}/activities`)
    window.requestAnimationFrame(() => activityDetailTrigger.current?.focus())
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
      <AsyncState
        description="Loading project activities."
        icon={Loader2}
        status="loading"
        title="Loading activities"
      />
    )
  }

  if (loadError === 'error') {
    return (
      <>
        <PageHeader
          title="Workspace unavailable"
          description="This project is currently unavailable."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="The project could not be loaded. Check your connection and try again."
          icon={LayoutGrid}
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          status="error"
          title="Activities unavailable"
        />
      </>
    )
  }

  if (loadError === 'not-found' || !project) {
    return (
      <>
        <PageHeader
          title="Project not found"
          description="This project is not available to the current account."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="Return to the project directory and choose an available project."
          icon={LayoutGrid}
          status="empty"
          title="Project unavailable"
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={labels.projectActivities}
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
      {canCreateEdit ? (
        <div className="flex justify-end">
          <Button className="gap-2 whitespace-nowrap" onClick={openCreate} type="button">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Activity
          </Button>
        </div>
      ) : null}
      <FilterBar className="min-w-0 !flex flex-col gap-5 lg:!flex-row lg:items-center lg:justify-between lg:gap-8">
        <ActivityStatusSummary
          activeStatus={statusFilter}
          counts={activityStatusCounts}
          onStatusChange={setStatusFilter}
        />
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center lg:ml-auto lg:max-w-2xl lg:flex-1 lg:justify-end">
          <div className="relative min-w-0 flex-1 lg:max-w-lg">
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
          <fieldset className="m-0 flex gap-2 border-0 p-0">
            <legend className="sr-only">Activity view</legend>
            <Button
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              size="icon"
              type="button"
              variant={viewMode === 'list' ? 'default' : 'outline'}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              aria-label="Board view"
              aria-pressed={viewMode === 'board'}
              onClick={() => setViewMode('board')}
              size="icon"
              type="button"
              variant={viewMode === 'board' ? 'default' : 'outline'}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </Button>
          </fieldset>
        </div>
      </FilterBar>
      <ResultsAnnouncement
        message={
          filteredActivities.length === 0
            ? 'No activities match the current search and status filter.'
            : `${filteredActivities.length} ${filteredActivities.length === 1 ? 'activity matches' : 'activities match'} the current search and status filter.`
        }
        settleKey={`${query}|${statusFilter ?? 'all'}`}
      />
      {filteredActivities.length === 0 ? (
        <EmptyState
          description="Create an activity or adjust the search and status filters."
          icon={LayoutGrid}
          title="No activities match the current view"
        />
      ) : null}
      {filteredActivities.length > 0 && viewMode === 'board' ? (
        <section aria-label="Activity board" className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleActivityStatuses.map((status) => {
            const statusActivities = filteredActivities.filter(
              (activity) => activity.status === status,
            )

            return (
              <SectionCard
                key={status}
                title={status}
                description={`${statusActivities.length} activit${statusActivities.length === 1 ? 'y' : 'ies'}`}
                className="min-w-0 self-start"
              >
                <div className="space-y-3">
                  {statusActivities.map((activity) => (
                    <ActivityCard key={activity.id} activity={activity} onOpen={openDetail} />
                  ))}
                </div>
              </SectionCard>
            )
          })}
        </section>
      ) : null}
      {filteredActivities.length > 0 && viewMode === 'list' ? (
        <SectionCard title="Activity list">
          <div className="space-y-3">
            {filteredActivities.map((activity) => (
              <ActivityListRow key={activity.id} activity={activity} onOpen={openDetail} />
            ))}
          </div>
        </SectionCard>
      ) : null}
      <ActivityDetailPanel
        activity={selectedActivity}
        canDecideProof={canDecideProof}
        canEdit={canCreateEdit}
        canLogExpense={canLogExpense}
        canRequestExtension={role === 'Project Officer' && inProjectScope}
        canSubmitProof={canSubmitProof}
        canValidateExpense={role === 'Monitoring and Evaluation Officer' && inProjectScope}
        canValidateProof={canValidateProof}
        indicators={indicators}
        onActivityChanged={(activity) => upsertActivity(activity, false)}
        onEdit={openEdit}
        onOpenChange={closeDetail}
        onSubmitProof={openProof}
        open={Boolean(selectedActivity)}
        requestedProofId={initialProofId}
      />
      <ActivityFormDialog
        activity={editingActivity}
        indicators={indicators}
        journeyStages={journeyStages}
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
