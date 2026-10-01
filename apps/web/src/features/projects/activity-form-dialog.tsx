'use client'
import { SourceMutationRecovery } from './source-mutation-recovery'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ConfirmationDialog, DialogShell, LockedField } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import {
  type SensitiveDraftOwner,
  readSensitiveDraft,
  removeSensitiveDraft,
  useSensitiveDraftOwner,
  writeSensitiveDraft,
} from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { isSourceReplay, sourceMutationTickets } from '@/lib/services/source-mutation'
import type {
  Activity,
  AssignableProjectOfficer,
  Indicator,
  JourneyStageConfig,
} from '@/types/pathways'

import { type ActivityFormSchema, createActivityFormSchema } from './activity-form-validation'
import { activityStatuses, formatCurrency } from './activity-utils'

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
  return <ScopedActivityFormDialog key={scope.key + scope.generation} {...props} scope={scope} />
}
const ScopedActivityFormDialog = ({
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
  const savedPhase = useRef<{ input: string; activity: Activity } | null>(null)
  const [recoveringPhase, setRecoveringPhase] = useState(false)
  const canEditStatus = isUiActionAvailable(role, 'activities.status.edit', profile)
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
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
    resolver: zodResolver(formSchema),
    defaultValues,
  })
  const draftStorageKey = scope.key
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

  useEffect(() => {
    if (!open) {
      setDraftHydrated(false)
      setDraftRecovered(false)
      return
    }

    let nextValues = initialValues
    try {
      const stored = readSensitiveDraft(draftStorageKey)
      if (stored) {
        const parsed = stored as Partial<Record<keyof ActivityFormSchema, unknown>>
        if (stored.projectId !== projectId) return
        const restored = { ...initialValues }

        for (const key of Object.keys(initialValues) as Array<keyof ActivityFormSchema>) {
          const value = parsed[key]
          const baseline = initialValues[key]
          if (Array.isArray(baseline) && Array.isArray(value)) {
            Object.assign(restored, {
              [key]: value
                .slice(0, 100)
                .filter((item) => typeof item === 'string' && item.length <= 10_000),
            })
          } else if (
            typeof value === typeof baseline &&
            (typeof value !== 'string' || value.length <= 10_000)
          ) {
            Object.assign(restored, { [key]: value })
          }
        }

        restored.assignedOfficers = restored.assignedOfficers.filter((officer) =>
          officerIds.includes(officer),
        )
        restored.connectedIndicators = restored.connectedIndicators.filter((indicatorId) =>
          indicatorIds.includes(indicatorId),
        )
        restored.journeyStageId = journeyStageIds.includes(restored.journeyStageId)
          ? restored.journeyStageId
          : ''
        nextValues = restored
        setDraftRecovered(true)
      }
    } catch {
      removeSensitiveDraft(draftStorageKey)
    }

    form.reset(nextValues)
    setDraftHydrated(true)
  }, [
    draftStorageKey,
    form,
    indicatorIds,
    initialValues,
    journeyStageIds,
    officerIds,
    open,
    projectId,
  ])

  useEffect(() => {
    if (!open || !draftHydrated) {
      return
    }

    const subscription = form.watch((values) => {
      if (!scope.isCurrent()) return
      const nextValues = values as ActivityFormSchema
      if (JSON.stringify(nextValues) === JSON.stringify(initialValues)) {
        removeSensitiveDraft(draftStorageKey)
      } else {
        writeSensitiveDraft(draftStorageKey, { ...nextValues, projectId }, scope.generation)
      }
    })

    return () => subscription.unsubscribe()
  }, [
    draftHydrated,
    draftStorageKey,
    form,
    initialValues,
    open,
    projectId,
    scope.isCurrent,
    scope.generation,
  ])

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
          ? await pathwaysClient.updateActivity(
              { ...input, id: activity.id, expectedUpdatedAt: activity.updatedAt },
              mutationContext,
            )
          : await pathwaysClient.createActivity(input, mutationContext))
      if (!scope.isCurrent() || !mutationContext.isCurrent()) return
      if (isSourceReplay(first)) {
        await pathwaysClient.getActivities(projectId)
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
        const transition = await pathwaysClient.transitionActivity(
          projectId,
          savedActivity.id,
          'IN_PROGRESS',
          savedActivity.updatedAt,
          undefined,
          transitionContext,
        )
        if (!scope.isCurrent() || !transitionContext.isCurrent()) return
        savedActivity = isSourceReplay(transition)
          ? await pathwaysClient.getActivity(projectId, savedActivity.id)
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
                  await pathwaysClient.getActivities(projectId)
                  return () => {
                    savedPhase.current = null
                    setRecoveringPhase(false)
                    removeSensitiveDraft(draftStorageKey)
                    onOpenChange(false)
                    void onAcknowledged?.()
                  }
                }}
              />
              <FormField
                control={form.control}
                name="overrideJustification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timeline override justification</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>
                      Required only when activity dates fall outside the project timeline. The
                      variance is retained for review.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {draftRecovered ? (
                <output
                  aria-atomic="true"
                  aria-live="polite"
                  className="block rounded-xl border border-info/25 bg-info-subtle p-3 text-sm text-info"
                >
                  Recovered your unsaved activity draft.
                </output>
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormLabel required>Activity title</FormLabel>
                      <FormControl aria-required="true">
                        <Input placeholder="Run community orientation sessions" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormLabel required>Description</FormLabel>
                      <FormControl aria-required="true">
                        <Textarea
                          placeholder="Implementation scope, location, and expected output"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {canEditStatus ? (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem className="lg:col-span-2">
                        <FormLabel required>Activity status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl aria-required="true">
                            <SelectTrigger>
                              <SelectValue placeholder="Select activity status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {activityStatuses
                              .filter((status) => status !== 'Cancelled')
                              .map((status) => (
                                <SelectItem
                                  key={status}
                                  value={status}
                                  disabled={
                                    status !== 'Planned' &&
                                    status !== 'In Progress' &&
                                    status !== activity?.status
                                  }
                                >
                                  {status}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Start date</FormLabel>
                      <FormControl aria-required="true">
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Due date</FormLabel>
                      <FormControl aria-required="true">
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="targetBeneficiaries"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target beneficiaries</FormLabel>
                      <FormControl>
                        <Input min={0} type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {canEditBudget ? (
                  <FormField
                    control={form.control}
                    name="budgetAllocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Activity budget</FormLabel>
                        <FormControl>
                          <Input min={0} step="0.01" type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : canReadBudget ? (
                  <LockedField
                    label="Activity budget"
                    value={
                      activity?.budgetAllocation === null ||
                      activity?.budgetAllocation === undefined
                        ? ''
                        : formatCurrency(activity.budgetAllocation)
                    }
                  />
                ) : null}
                {activity ? (
                  <>
                    <FormField
                      control={form.control}
                      name="progress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Progress</FormLabel>
                          <FormControl>
                            <Input max={100} min={0} type="number" disabled {...field} />
                          </FormControl>
                          <FormDescription>
                            Progress changes use the proof review workflow.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="beneficiariesReached"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Beneficiaries reached</FormLabel>
                          <FormControl>
                            <Input min={0} type="number" disabled {...field} />
                          </FormControl>
                          <FormDescription>
                            Server-computed distinct qualifying beneficiaries.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="budgetLogged"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Logged budget</FormLabel>
                          <FormControl>
                            <Input
                              min={0}
                              step="0.01"
                              type="number"
                              disabled
                              {...field}
                              placeholder={
                                activity?.budgetLogged === null ? 'Unavailable' : undefined
                              }
                              value={activity?.budgetLogged ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            {activity?.budgetLoggedEntries === 0
                              ? 'None yet. No approved expense entries are recorded against this activity.'
                              : 'Sum of approved expenses recorded against this activity.'}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                ) : null}
                <FormField
                  control={form.control}
                  name="assignedOfficers"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormControl aria-required="true">
                        <fieldset className="space-y-2 rounded-xl border border-input bg-background p-3">
                          <legend className="px-1 text-sm font-medium text-foreground">
                            Assigned officers
                            <span aria-hidden="true" className="ml-1 text-danger">
                              *
                            </span>
                            <span className="sr-only"> (required)</span>
                          </legend>
                          {officers.length > 0 ? (
                            officers.map((officer) => (
                              <label
                                className="flex min-h-11 items-center gap-3 rounded-md border border-border p-3 text-sm"
                                key={officer.userId}
                              >
                                <input
                                  checked={field.value.includes(officer.userId)}
                                  className="h-4 w-4 rounded border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onBlur={field.onBlur}
                                  onChange={(event) =>
                                    field.onChange(
                                      event.target.checked
                                        ? [...field.value, officer.userId]
                                        : field.value.filter((id) => id !== officer.userId),
                                    )
                                  }
                                  type="checkbox"
                                  value={officer.userId}
                                />
                                <span className="font-medium text-foreground">
                                  {officer.displayName}
                                </span>
                              </label>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No active Project Officers are assigned to this project.
                            </p>
                          )}
                        </fieldset>
                      </FormControl>
                      <FormDescription>
                        Choose only active Project Officers assigned to this project.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {canLinkIndicators ? (
                  <FormField
                    control={form.control}
                    name="connectedIndicators"
                    render={({ field }) => (
                      <FormItem className="lg:col-span-2">
                        <FormControl>
                          <fieldset className="space-y-2 rounded-xl border border-input bg-background p-3">
                            <legend className="px-1 text-sm font-medium text-foreground">
                              Connected indicators
                            </legend>
                            {indicators.length > 0 ? (
                              indicators.map((indicator) => (
                                <label
                                  className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
                                  key={indicator.id}
                                >
                                  <input
                                    checked={field.value.includes(indicator.id)}
                                    className="mt-0.5 h-4 w-4 rounded border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onBlur={field.onBlur}
                                    onChange={(event) =>
                                      field.onChange(
                                        event.target.checked
                                          ? [...field.value, indicator.id]
                                          : field.value.filter(
                                              (indicatorId) => indicatorId !== indicator.id,
                                            ),
                                      )
                                    }
                                    type="checkbox"
                                    value={indicator.id}
                                  />
                                  <span>
                                    <span className="font-medium text-foreground">
                                      {indicator.code}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                      {indicator.label}
                                    </span>
                                  </span>
                                </label>
                              ))
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No indicators are configured for this project.
                              </p>
                            )}
                          </fieldset>
                        </FormControl>
                        <FormDescription>
                          Optional. Only indicators from this project are available.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : canReadIndicators ? (
                  <LockedField
                    className="lg:col-span-2"
                    label="Connected indicators"
                    multiline
                    value={lockedIndicatorValue || 'None linked'}
                  />
                ) : null}
                <FormField
                  control={form.control}
                  name="journeyStageId"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormLabel>Journey stage</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                        value={field.value || 'none'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project journey stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No journey stage</SelectItem>
                          {journeyStages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.code} — {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Optional. Only journey stages from this project are available.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>
                  Cancel
                </Button>
                <Button className="gap-2" disabled={form.formState.isSubmitting} type="submit">
                  {form.formState.isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  {activity ? 'Save Activity' : 'Create Activity'}
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
