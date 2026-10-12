'use client'

import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  EmptyState,
  FilterBar,
  ResultsAnnouncement,
  SectionCard,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { PathwaysClientError } from '@/lib/api/core/request'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import type { Activity, ActivitySummary } from '@/types/pathways'

import {
  useProjectIndicatorsRead,
  useProjectJourneyStagesRead,
  useProjectRead,
} from '../../projects.reads'
import {
  useActivityDetailRead,
  useAssignableOfficersRead,
  useProjectActivitiesRead,
} from '../activities.reads'
import { activitySummary } from '../activities.utils'
import { useActivityExpenses } from '../hooks/use-activity-expenses'
import { useActivityFilters } from '../hooks/use-activity-filters'
import { ActivityCard } from './activity-card'
import { ActivityDetailPanel } from './activity-detail-panel'
import { ActivityEditorLoadingDialog } from './activity-editor-loading-dialog'
import { ActivityFormDialog } from './activity-form-dialog'
import { ActivityListTable } from './activity-list-table'
import { ActivityProofDialog } from './activity-proof-dialog'
import { ActivityStatusSummary } from './activity-status-summary'

// A saved activity keeps the list-only metrics the save response does not carry.
const pickMetrics = (previous: ActivitySummary | undefined) => ({
  beneficiariesReached: previous?.beneficiariesReached,
  budgetUtilization: previous?.budgetUtilization,
})

export const ProjectActivitiesWorkspace = ({
  initialAction,
  initialActivityId,
  initialProofId,
  projectId,
}: {
  initialAction?: string
  initialActivityId?: string
  initialProofId?: string
  projectId: string
}) => {
  const { role, assignedProjectIds, profile } = useCurrentRole()
  const inProjectScope = role ? canAccessProjectForRole(role, projectId, assignedProjectIds) : false
  // Create and edit are separate authorities (a create-only role never edits).
  // Per-activity Edit, Record progress and Submit proof also need the server-computed
  // activity capabilities, which the detail panel applies.
  const canCreate = inProjectScope && principalHasAtomicPermission(profile, 'activities.create')
  const canUpdate = inProjectScope && principalHasAtomicPermission(profile, 'activities.update')
  const canReadIndicators = principalHasAtomicPermission(profile, 'indicators.read')
  const canReadJourneyStages = principalHasAtomicPermission(profile, 'journeys.read')
  const canReadBudget =
    principalHasAtomicPermission(profile, 'budgets.read') &&
    principalHasAtomicPermission(profile, 'expenses.read')
  const canReadOfficers = canCreate || canUpdate
  const canSubmitProof =
    inProjectScope && principalHasAtomicPermission(profile, 'activities.proof.submit')
  const canRecordProgress =
    inProjectScope && isUiActionAvailable(role, 'activities.progress.record', profile)
  const canLogExpense = role === 'Project Officer' && inProjectScope
  const canValidateProof =
    role === 'Monitoring and Evaluation Officer' &&
    inProjectScope &&
    principalHasAtomicPermission(profile, 'evidence.review')
  const canDecideProof = false
  const canValidateExpense = role === 'Monitoring and Evaluation Officer' && inProjectScope
  // Expense-budget references never expose plan amounts; they are also the only project-scoped
  // read that carries the activity linkage, so both the submit dialog and the pending-expense
  // list for an activity reuse them instead of a broader budgets.read query.
  const canReadExpenseReferences =
    (canLogExpense || canValidateExpense) &&
    principalHasAtomicPermission(profile, 'expenses.submit')
  // Any in-scope principal holding the grant, not only the officer who logs and the officer
  // who verifies: the Project Manager who approves has to see the same entries.
  const canReadExpenses = inProjectScope && principalHasAtomicPermission(profile, 'expenses.read')
  const canReadBudgetLines = inProjectScope && principalHasAtomicPermission(profile, 'budgets.read')

  // The detail route opens by id through GET /activities/:id; the list is never searched.
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    initialActivityId ?? null,
  )
  const activityDetailTrigger = useRef<HTMLElement | null>(null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [proofActivity, setProofActivity] = useState<Activity | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  // Shared with the Overview tab: one project read per workspace visit.
  const projectRead = useProjectRead(projectId)
  const activityList = useProjectActivitiesRead(projectId)
  const project = projectRead.data ?? null
  const activities = activityList.data ?? []
  const loadFailure = projectRead.isError ? projectRead.error : activityList.error
  // Only a real not-found error reaches the not-found view; data that is hidden while
  // access is re-verified stays in the loading state.
  const loading =
    !projectRead.eligible ||
    !activityList.eligible ||
    projectRead.isPending ||
    activityList.isPending ||
    (!loadFailure && (!project || !activityList.data))
  const loadError = loadFailure
    ? loadFailure instanceof PathwaysClientError && loadFailure.code === 'not_found'
      ? 'not-found'
      : 'error'
    : 'none'
  // Loaded once per workspace with stable keys, so search works without opening a panel.
  const indicatorRead = useProjectIndicatorsRead(projectId, canReadIndicators)
  const journeyStageRead = useProjectJourneyStagesRead(projectId, canReadJourneyStages)
  // Project-scoped assignable officers (userId and displayName only), not GET /users.
  const officerRead = useAssignableOfficersRead(
    projectId,
    canCreate ? 'activities.create' : 'activities.update',
    canReadOfficers && formOpen,
  )
  const indicatorRows = indicatorRead.data ?? []
  // Code and label only, the shape the editor and the search index expect.
  const indicators = indicatorRows.map(({ id, projectId: scope, code, name }) => ({
    id,
    projectId: scope,
    code,
    label: name,
  }))
  const journeyStages = journeyStageRead.data ?? []
  const officers = officerRead.data ?? []
  const editorReads = [
    canReadIndicators ? indicatorRead : null,
    canReadJourneyStages ? journeyStageRead : null,
    canReadOfficers ? officerRead : null,
  ].filter((read) => read !== null)
  const editorReady = editorReads.every((read) => read.data !== undefined)
  const editorFailed = editorReads.some((read) => read.isError)
  const detail = useActivityDetailRead(projectId, selectedActivityId)
  const selectedActivity = detail.data ?? null
  const { activityExpenses, budgetReferences, pendingExpenses, refreshExpenses } =
    useActivityExpenses({
      canReadBudgetLines,
      canReadExpenseReferences,
      canReadExpenses,
      projectId,
      refetchDetail: () => detail.refetch(),
      selectedActivity,
    })
  const detailNotFound =
    detail.isError &&
    detail.error instanceof PathwaysClientError &&
    ['not_found', 'forbidden'].includes(detail.error.code)

  const {
    activityStatusCounts,
    filteredActivities,
    query,
    setQuery,
    setStatusFilter,
    setViewMode,
    statusFilter,
    viewMode,
    visibleActivityStatuses,
  } = useActivityFilters(activities, indicators)

  const upsertActivity = (activity: Activity, selectActivity = true) => {
    if (!project) return
    const item = activitySummary(activity)
    activityList.replaceData((previous) => [
      ...(previous ?? []).filter((current) => current.id !== activity.id),
      {
        ...item,
        ...pickMetrics(previous?.find((current) => current.id === activity.id)),
      },
    ])
    // Kept metrics are stale after a review or edit, so reread the list for reach and budget.
    void activityList.refetch()
    if (selectActivity || selectedActivityId === activity.id) {
      setSelectedActivityId(activity.id)
      if (selectedActivityId === activity.id) detail.replaceData(() => activity)
    }
  }

  const openDetail = (activity: ActivitySummary) => {
    activityDetailTrigger.current = document.activeElement as HTMLElement | null
    // Opens in place; pushing a URL here makes Next render the detail route and remount the page.
    setSelectedActivityId(activity.id)
  }

  const closeDetail = (open: boolean) => {
    if (open) {
      return
    }

    setSelectedActivityId(null)
    window.requestAnimationFrame(() => activityDetailTrigger.current?.focus())
  }

  const openCreate = () => {
    if (!canCreate) {
      return
    }

    setEditingActivity(null)
    setFormOpen(true)
  }

  const openEdit = (activity: Activity) => {
    if (!canUpdate || !activity.capabilities?.canEdit) {
      return
    }

    setEditingActivity(activity)
    setFormOpen(true)
  }

  const openProof = (activity: Activity) => {
    if (!canSubmitProof || !activity.capabilities?.canSubmitProof) {
      return
    }

    setProofActivity(activity)
    setProofOpen(true)
  }

  // A dashboard "Submit update" link opens the update form once the activity loads.
  const updateOpened = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per loaded activity.
  useEffect(() => {
    if (initialAction !== 'update' || updateOpened.current || !selectedActivity) return
    if (selectedActivity.id !== initialActivityId) return
    updateOpened.current = true
    openProof(selectedActivity)
  }, [initialAction, initialActivityId, selectedActivity])

  if (loading) {
    return (
      <AsyncState
        description="Loading project activities."
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
          onRetry={() => {
            if (projectRead.isError) void projectRead.refetch()
            if (activityList.isError) void activityList.refetch()
          }}
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
      <FilterBar className="min-w-0 flex-wrap gap-x-3 gap-y-2 px-3 py-2">
        <ActivityStatusSummary
          activeStatus={statusFilter}
          counts={activityStatusCounts}
          onStatusChange={setStatusFilter}
        />
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:max-w-2xl lg:flex-1 lg:justify-end">
          <div className="relative min-w-[12rem] flex-1 lg:max-w-lg">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search activities"
              className="h-9 pl-9"
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
              className="h-9 w-9"
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
              className="h-9 w-9"
              size="icon"
              type="button"
              variant={viewMode === 'board' ? 'default' : 'outline'}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </Button>
          </fieldset>
          {canCreate ? (
            <Button
              className="gap-2 whitespace-nowrap"
              onClick={openCreate}
              size="sm"
              type="button"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Activity
            </Button>
          ) : null}
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
        <ActivityListTable
          activities={filteredActivities}
          canReadBudget={canReadBudget}
          onOpen={openDetail}
          projectId={projectId}
        />
      ) : null}
      {selectedActivityId && detail.isError ? (
        <div className="space-y-3">
          <AsyncState
            description={
              detailNotFound
                ? 'This activity is not available in this project for the current account.'
                : 'The activity could not be loaded. Check your connection and try again.'
            }
            icon={LayoutGrid}
            onRetry={detailNotFound ? undefined : () => void detail.refetch()}
            status={detailNotFound ? 'empty' : 'error'}
            title={detailNotFound ? 'Activity not found' : 'Activity unavailable'}
          />
          <Button onClick={() => closeDetail(false)} type="button" variant="outline">
            Back to all activities
          </Button>
        </div>
      ) : null}
      <ActivityDetailPanel
        activity={selectedActivity}
        budgetReferences={budgetReferences}
        loading={Boolean(selectedActivityId) && detail.isPending}
        canDecideProof={canDecideProof}
        canDecideExtension={role === 'Project Manager' && inProjectScope && canUpdate}
        canEdit={canUpdate}
        canLogExpense={canLogExpense}
        canReadBudgets={principalHasAtomicPermission(profile, 'budgets.read')}
        canRecordProgress={canRecordProgress}
        canRequestExtension={role === 'Project Officer' && inProjectScope}
        canSubmitProof={canSubmitProof}
        canValidateExpense={canValidateExpense}
        canValidateProof={canValidateProof}
        canOpenProof={principalHasAtomicPermission(profile, 'evidence.read')}
        indicatorRows={indicatorRows}
        indicators={indicators}
        projectTeam={project?.team ?? []}
        journeyStages={journeyStages}
        onActivityChanged={(activity) => upsertActivity(activity, false)}
        onEdit={openEdit}
        onExpensesChanged={refreshExpenses}
        onOpenChange={closeDetail}
        onSubmitProof={openProof}
        open={Boolean(selectedActivityId) && !detail.isError}
        activityExpenses={activityExpenses}
        canReadExpenses={canReadExpenses}
        pendingExpenses={pendingExpenses}
        focusExtension={initialAction === 'extension'}
        requestedProofId={initialProofId}
      />
      <ActivityEditorLoadingDialog
        failed={editorFailed}
        onOpenChange={setFormOpen}
        onRetry={() => {
          for (const read of editorReads) if (read.isError) void read.refetch()
        }}
        open={formOpen && !editorReady}
      />
      <ActivityFormDialog
        onAcknowledged={() => activityList.refetch()}
        activity={editingActivity}
        indicators={indicators}
        journeyStages={journeyStages}
        onCreatedOrUpdated={upsertActivity}
        onOpenChange={setFormOpen}
        open={formOpen && editorReady}
        projectId={projectId}
        officers={officers}
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
