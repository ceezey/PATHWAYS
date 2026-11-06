'use client'
import { SourceMutationRecovery } from '../../components/source-mutation-recovery'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { type Resolver, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ConfirmationDialog, DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { activitiesClient } from '@/lib/api/activities'
import { isSourceReplay, sourceMutationTickets } from '@/lib/api/core/source-mutation'
import {
  type SensitiveDraftOwner,
  removeSensitiveDraft,
  useSensitiveDraftOwner,
} from '@/lib/auth/sensitive-drafts'
import { createdSince, fingerprintOf } from '@/lib/forms/pending-create'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import type {
  Activity,
  AssignableProjectOfficer,
  Indicator,
  JourneyStageConfig,
} from '@/types/pathways'

import { type ActivityFormSchema, createActivityFormSchema } from '../activity-form.utils'
import { useActivityFormDraft } from '../hooks/use-activity-form-draft'
import { ActivityFormFields } from './activity-form-fields'

const defaultValues: ActivityFormSchema = {
  overrideJustification: '',
  title: '',
  description: '',
  startDate: '',
  dueDate: '',
  targetBeneficiaries: 0,
  budgetAllocation: '',
  assignedOfficers: [],
  connectedIndicators: [],
  journeyStageId: '',
  status: 'Planned',
  progress: 0,
  beneficiariesReached: 0,
  budgetLogged: null,
}

export const ActivityFormDialog = (props: {
  activity: Activity | null
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  open: boolean
  projectId: string
  /** From the project-scoped assignable-officer read, never from GET /users. */
  officers: AssignableProjectOfficer[]
  onAcknowledged?: () => Promise<unknown>
  onCreatedOrUpdated: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
}) => {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(
    profile,
    'activity',
    props.activity ? 'activities.update' : 'activities.create',
    props.projectId,
    props.activity?.id ?? null,
    props.open,
  )
  if (!scope || (props.activity && props.activity.projectId !== props.projectId)) return null
  return <ActivityFormDialogContent key={scope.key + scope.generation} {...props} scope={scope} />
}
const ActivityFormDialogContent = ({
  activity,
  scope,
  indicators,
  journeyStages,
  open,
  projectId,
  officers,
  onAcknowledged,
  onCreatedOrUpdated,
  onOpenChange,
}: {
  activity: Activity | null
  scope: SensitiveDraftOwner
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  open: boolean
  projectId: string
  officers: AssignableProjectOfficer[]
  onAcknowledged?: () => Promise<unknown>
  onCreatedOrUpdated: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
}) => {
  const { role, profile } = useCurrentRole()
  const mutationContext = useSourceMutationContext(
    profile,
    activity ? 'activities.update' : 'activities.create',
    projectId,
    JSON.stringify([activity?.id, activity?.updatedAt]),
    open,
  )
  const transitionContext = useSourceMutationContext(
    profile,
    'activities.complete',
    projectId,
    activity?.id ?? null,
    open,
  )
  const pendingCreate = usePendingCreate<Activity>({
    profile,
    kind: 'activity',
    projectId,
    successMessage: 'Activity created',
    findCreated: async (fingerprint, startedAt) => {
      const found = (await activitiesClient.getActivities(projectId)).find(
        (item) =>
          fingerprintOf(item.title) === fingerprint && createdSince(item.updatedAt, startedAt),
      )
      return found ? activitiesClient.getActivity(projectId, found.id) : null
    },
    onConfirmed: (record) => {
      removeSensitiveDraft(draftStorageKey)
      onCreatedOrUpdated(record)
      onOpenChange(false)
    },
  })
  const savedPhase = useRef<{ input: string; activity: Activity } | null>(null)
  const [recoveringPhase, setRecoveringPhase] = useState(false)
  const canEditStatus = isUiActionAvailable(role, 'activities.status.edit', profile)
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
  // The API accepts exactly these assignees; the form stores their user ids.
  const officerIds = useMemo(() => officers.map((officer) => officer.userId), [officers])
  const indicatorIds = useMemo(() => indicators.map((indicator) => indicator.id), [indicators])
  const journeyStageIds = useMemo(() => journeyStages.map((stage) => stage.id), [journeyStages])
  // Locked fields mirror the API checks in activities.service (saveActivityBudget,
  // resolveIndicators). A locked field is never sent; readable values show locked.
  const canEditBudget =
    principalHasAtomicPermission(profile, 'budgets.create') &&
    (!activity || principalHasAtomicPermission(profile, 'budgets.update'))
  const canReadBudget = !activity || principalHasAtomicPermission(profile, 'budgets.read')
  const canLinkIndicators = principalHasAtomicPermission(profile, 'indicators.update')
  const canReadIndicators = principalHasAtomicPermission(profile, 'indicators.read')
  const lockedIndicatorValue = (activity?.indicatorIds ?? [])
    .map((indicatorId) => {
      const indicator = indicators.find((item) => item.id === indicatorId)
      return indicator ? `${indicator.code} - ${indicator.label}` : 'Linked indicator'
    })
    .join('\n')
  const formSchema = useMemo(
    () => createActivityFormSchema({ indicatorIds, journeyStageIds, officerIds }),
    [indicatorIds, journeyStageIds, officerIds],
  )
  const form = useForm<ActivityFormSchema>({
    // Zod 4 types coerced inputs as unknown; the form holds output-shaped values.
    resolver: zodResolver(formSchema) as Resolver<ActivityFormSchema>,
    defaultValues,
  })
  const draftStorageKey = scope.key
  const savePending = form.formState.isSubmitting || pendingCreate.confirming
  const initialValues = useMemo<ActivityFormSchema>(
    () =>
      activity
        ? {
            overrideJustification: activity.timelineOverrideJustification ?? '',
            title: activity.title,
            description: activity.description,
            startDate: activity.startDate,
            dueDate: activity.dueDate,
            targetBeneficiaries: activity.targetBeneficiaries,
            budgetAllocation: activity.budgetAllocation ?? '',
            assignedOfficers: activity.assignedUserIds.filter((userId) =>
              officerIds.includes(userId),
            ),
            connectedIndicators: activity.indicatorIds.filter((indicatorId) =>
              indicatorIds.includes(indicatorId),
            ),
            journeyStageId: journeyStageIds.includes(activity.journeyStageId)
              ? activity.journeyStageId
              : '',
            status: activity.status === 'Cancelled' ? 'Planned' : activity.status,
            progress: activity.progress,
            beneficiariesReached: activity.beneficiariesReached,
            budgetLogged: activity.budgetLogged,
          }
        : defaultValues,
    [activity, indicatorIds, journeyStageIds, officerIds],
  )

  const { draftRecovered } = useActivityFormDraft({
    draftStorageKey,
    form,
    indicatorIds,
    initialValues,
    journeyStageIds,
    officerIds,
    open,
    projectId,
    scope,
  })

  const onSubmit = async (values: ActivityFormSchema) => {
    if (!scope.isCurrent()) return
    // TODO(RBAC): Enforce create, edit, review, and approval permissions.
    // TODO(ALERTS): Recalculate overdue and progress alerts server-side.
    try {
      if (activity?.status === 'Cancelled')
        throw new Error('Cancelled activities cannot be edited.')
      const requestedStatus = canEditStatus ? values.status : (activity?.status ?? 'Planned')
      const priorStatus = activity?.status ?? 'Planned'
      if (requestedStatus !== priorStatus && requestedStatus !== 'In Progress') {
        throw new Error('This activity status transition is not supported by the current API.')
      }
      const assignedUserIds = values.assignedOfficers.filter((userId) =>
        officerIds.includes(userId),
      )
      if (assignedUserIds.length !== values.assignedOfficers.length)
        throw new Error('Select assigned project officers.')
      const input = {
        projectId,
        title: values.title,
        description: values.description,
        startDate: values.startDate,
        dueDate: values.dueDate,
        timelineOverrideJustification: values.overrideJustification?.trim() || undefined,
        targetBeneficiaries: values.targetBeneficiaries,
        ...(!canEditBudget || values.budgetAllocation === ''
          ? {}
          : { budgetAllocation: String(values.budgetAllocation) }),
        assignedUserIds,
        ...(canLinkIndicators ? { indicatorIds: values.connectedIndicators } : {}),
        journeyStageId: values.journeyStageId || null,
      }
      if (!mutationContext?.isCurrent()) return
      const semanticInput = JSON.stringify([input, requestedStatus])
      if (savedPhase.current && savedPhase.current.input !== semanticInput)
        throw new Error(
          'The activity save committed, but its status outcome remains unresolved. Retry unchanged before editing it.',
        )
      const first =
        savedPhase.current?.activity ??
        (activity
          ? await activitiesClient.updateActivity(
              { ...input, id: activity.id, expectedUpdatedAt: activity.updatedAt },
              mutationContext,
            )
          : await pendingCreate.submit(fingerprintOf(input.title), () =>
              activitiesClient.createActivity(input, mutationContext),
            ))
      if (!first) return
      if (!scope.isCurrent() || !mutationContext.isCurrent()) return
      if (isSourceReplay(first)) {
        await activitiesClient.getActivities(projectId)
        if (!scope.isCurrent() || !mutationContext.isCurrent()) return
        sourceMutationTickets.finishAcknowledgement(mutationContext, first.requestId)
        removeSensitiveDraft(draftStorageKey)
        void onAcknowledged?.()
        toast.success(
          'The earlier activity save is committed. Open its current record to check the status.',
        )
        onOpenChange(false)
        return
      }
      let savedActivity = first
      savedPhase.current = { input: semanticInput, activity: first }
      if (requestedStatus === 'In Progress' && savedActivity.status !== 'In Progress') {
        if (!transitionContext?.isCurrent())
          throw new Error('Current activity transition access is required.')
        setRecoveringPhase(true)
        const transition = await activitiesClient.transitionActivity(
          projectId,
          savedActivity.id,
          'IN_PROGRESS',
          savedActivity.updatedAt,
          undefined,
          transitionContext,
        )
        if (!scope.isCurrent() || !transitionContext.isCurrent()) return
        savedActivity = isSourceReplay(transition)
          ? await activitiesClient.getActivity(projectId, savedActivity.id)
          : transition
        if (!scope.isCurrent() || !transitionContext.isCurrent()) return
        if (isSourceReplay(transition))
          sourceMutationTickets.finishAcknowledgement(transitionContext, transition.requestId)
      }
      savedPhase.current = null
      setRecoveringPhase(false)

      if (!scope.isCurrent()) return
      toast.success(activity ? 'Activity updated.' : 'Activity created.', {
        description: `${savedActivity.title} is available with its saved targets, budget, assignments, and optional links.`,
      })
      removeSensitiveDraft(draftStorageKey)
      onCreatedOrUpdated(savedActivity)
      onOpenChange(false)
    } catch (error) {
      if (!scope.isCurrent()) return
      toast.error('Activity could not be saved.', {
        description: error instanceof Error ? error.message : 'Keep the dialog open and try again.',
      })
    }
  }

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && recoveringPhase) {
      toast.error('Resolve the earlier activity status save before closing. Retry unchanged.')
      return
    }
    if (!nextOpen && form.formState.isDirty) {
      setDiscardDialogOpen(true)
      return
    }

    onOpenChange(nextOpen)
  }

  const discardChanges = () => {
    if (recoveringPhase || form.formState.isSubmitting) return
    removeSensitiveDraft(draftStorageKey)
    form.reset(form.getValues())
    setDiscardDialogOpen(false)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog onOpenChange={requestOpenChange} open={open}>
        <DialogShell
          title={activity ? 'Edit activity' : 'Create activity'}
          description="Save activity details, targets, budget, assigned officers, and optional project links."
        >
          <Form {...form}>
            <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
              <SourceMutationRecovery
                context={savedPhase.current ? transitionContext : mutationContext}
                prefix={
                  savedPhase.current
                    ? `/projects/${projectId}/activities/${savedPhase.current.activity.id}/transition`
                    : activity
                      ? `/projects/${projectId}/activities/${activity.id}`
                      : `/projects/${projectId}/activities`
                }
                onRecovered={async () => {
                  await activitiesClient.getActivities(projectId)
                  return () => {
                    savedPhase.current = null
                    setRecoveringPhase(false)
                    removeSensitiveDraft(draftStorageKey)
                    onOpenChange(false)
                    void onAcknowledged?.()
                  }
                }}
              />
              {draftRecovered ? (
                <output
                  aria-atomic="true"
                  aria-live="polite"
                  className="block rounded-md border border-info/25 bg-info-subtle p-3 text-sm text-info"
                >
                  Recovered your unsaved activity draft.
                </output>
              ) : null}
              <ActivityFormFields
                activity={activity}
                canEditBudget={canEditBudget}
                canEditStatus={canEditStatus}
                canLinkIndicators={canLinkIndicators}
                canReadBudget={canReadBudget}
                canReadIndicators={canReadIndicators}
                form={form}
                indicators={indicators}
                journeyStages={journeyStages}
                lockedIndicatorValue={lockedIndicatorValue}
                officers={officers}
              />
              {pendingCreate.notice ? (
                <output className="block rounded-xl border border-info/25 bg-info-subtle p-3 text-sm text-info">
                  {pendingCreate.notice}
                </output>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>
                  Cancel
                </Button>
                <Button className="gap-2" disabled={savePending} type="submit">
                  {savePending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  {savePending && !activity
                    ? 'Creating...'
                    : activity
                      ? 'Save Activity'
                      : 'Create Activity'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogShell>
      </Dialog>
      <ConfirmationDialog
        cancelLabel="Stay and keep editing"
        confirmLabel="Discard activity changes"
        description="Your unsaved activity entries will be lost if you close this editor."
        onConfirm={discardChanges}
        onOpenChange={setDiscardDialogOpen}
        open={discardDialogOpen}
        title={`Discard changes to ${activity?.title ?? 'this new activity'}?`}
      />
    </>
  )
}
