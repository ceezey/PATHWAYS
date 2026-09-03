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
import {
  AsyncState,
  EmptyState,
  FilterBar,
  FilterChoiceGroup,
  ProgressBar,
  ResultsAnnouncement,
  SectionCard,
  StatusBadge,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
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
  type ActivityFilter,
  activityDueLabel,
  activityFilters,
  activityNextStep,
  activityProgressTone,
  activityStatusTone,
  activityStatuses,
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
  onOpen,
}: {
  activity: Activity
  onOpen: (activity: Activity) => void
}) => (
  <article
    aria-label={`Activity: ${activity.title}`}
    className="flex min-w-0 flex-col rounded-lg border border-border bg-background p-4 shadow-sm"
  >
    <div className="flex items-start justify-between gap-3">
      <h3 className="min-w-0 break-words text-base font-semibold leading-6 text-foreground">
        {activity.title}
      </h3>
      <div className="shrink-0">
        <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
      </div>
    </div>
    <p
      className={`mt-3 flex items-center gap-2 text-sm font-medium ${
        activity.status === 'Overdue' ? 'text-danger' : 'text-muted-foreground'
      }`}
    >
      <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {activityDueLabel(activity.status, activity.dueDate)}
    </p>
    <div className="mt-4">
      <ProgressBar
        label="Activity progress"
        tone={activityProgressTone(activity.status, activity.progress)}
        value={activity.progress}
      />
    </div>
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
    className="grid min-w-0 gap-4 rounded-lg border border-border bg-background p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(170px,0.7fr)_minmax(180px,0.8fr)_minmax(150px,0.6fr)_auto] xl:items-center"
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
    <ProgressBar
      label="Progress"
      tone={activityProgressTone(activity.status, activity.progress)}
      value={activity.progress}
    />
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
  counts,
  shownCount,
  totalCount,
}: {
  counts: Record<ActivityStatus, number>
  shownCount: number
  totalCount: number
}) => (
  <section
    aria-label="Activity status summary"
    className="rounded-lg border border-border bg-card p-4 shadow-sm"
  >
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Activity status at a glance</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Showing {shownCount} of {totalCount} activit{totalCount === 1 ? 'y' : 'ies'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {activityStatuses.map((status) => (
          <div
            className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
            key={status}
          >
            <StatusBadge tone={activityStatusTone(status)}>{status}</StatusBadge>
            <span className="text-sm font-semibold text-foreground">{counts[status]}</span>
          </div>
        ))}
      </div>
    </div>
  </section>
)

export const ProjectActivitiesWorkspace = ({
  initialActivityId,
  projectId,
}: {
  initialActivityId?: string
  projectId: string
}) => {
  const router = useRouter()
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
  const canCreateEdit = can(role, 'activities.create_edit')
  const canReview = role === 'Project Manager'
  const canSubmitProof = can(role, 'activities.submit_update_proof')
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [journeyStages, setJourneyStages] = useState<JourneyStageConfig[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<'none' | 'not-found' | 'error'>('none')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ActivityFilter>('All')
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
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

      return matchesQuery && matchesFilter(activity, filter)
    })
  }, [activities, filter, indicators, query])

  const activityStatusCounts = useMemo(() => {
    const counts: Record<ActivityStatus, number> = {
      Planned: 0,
      'In Progress': 0,
      'For Review': 0,
      Overdue: 0,
      Completed: 0,
    }

    for (const activity of filteredActivities) {
      counts[activity.status] += 1
    }

    return counts
  }, [filteredActivities])

  const visibleActivityStatuses = useMemo(
    () => activityStatuses.filter((status) => activityStatusCounts[status] > 0),
    [activityStatusCounts],
  )

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
      <AsyncState
        description="Loading the project workspace and activities."
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
          eyebrow={labels.projectWorkspace}
          title="Workspace unavailable"
          description="This project workspace is not available in the current prototype session."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="The project workspace could not be loaded. Check your connection and try again."
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
          eyebrow={labels.projectWorkspace}
          title="Project not found"
          description="This project is not available in the current prototype session."
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
          title="No project workspace"
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={labels.projectWorkspace}
        title={labels.projectActivities}
        description="Plan, review, and update project activities."
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
      <FilterBar className="md:flex-col md:items-stretch xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1 xl:min-w-72">
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
        <FilterChoiceGroup
          className="grid w-full grid-cols-2 sm:grid-cols-4 xl:flex xl:w-auto"
          label="Activity status filter"
          onValueChange={(value) => setFilter(value as ActivityFilter)}
          options={activityFilters}
          value={filter}
        />
        <div className="flex w-full items-center justify-between gap-2 sm:justify-end xl:w-auto">
          <fieldset className="m-0 flex gap-2 border-0 p-0">
            <legend className="sr-only">Activity view</legend>
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
          </fieldset>
          {canCreateEdit ? (
            <Button className="gap-2" onClick={openCreate} type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Activity
            </Button>
          ) : null}
        </div>
      </FilterBar>
      <ActivityStatusSummary
        counts={activityStatusCounts}
        shownCount={filteredActivities.length}
        totalCount={activities.length}
      />
      <ResultsAnnouncement
        message={
          filteredActivities.length === 0
            ? 'No activities match the current search and status filter.'
            : `${filteredActivities.length} ${filteredActivities.length === 1 ? 'activity matches' : 'activities match'} the current search and status filter.`
        }
        settleKey={`${query}|${filter}`}
      />
      {filteredActivities.length === 0 ? (
        <EmptyState
          description="Create an activity or adjust the search and filter controls."
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
        <SectionCard title="Activity list" description="Scan all filtered activities in one view.">
          <div className="space-y-3">
            {filteredActivities.map((activity) => (
              <ActivityListRow key={activity.id} activity={activity} onOpen={openDetail} />
            ))}
          </div>
        </SectionCard>
      ) : null}
      <ActivityDetailPanel
        activity={selectedActivity}
        canEdit={canCreateEdit}
        canReview={canReview}
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
