'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ConfirmationDialog, DialogShell } from '@/components/pathways'
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
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type {
  Activity,
  ActivityStatus,
  Indicator,
  JourneyStageConfig,
  UserRecord,
} from '@/types/pathways'

import { type ActivityFormSchema, createActivityFormSchema } from './activity-form-validation'
import { activityStatuses } from './activity-utils'

const defaultValues: ActivityFormSchema = {
  title: '',
  description: '',
  startDate: '',
  dueDate: '',
  targetBeneficiaries: 1,
  budgetAllocation: 1,
  assignedOfficers: [],
  connectedIndicators: [],
  journeyStageId: '',
  status: 'Planned',
  progress: 0,
  beneficiariesReached: 0,
  budgetLogged: 0,
}

export const ActivityFormDialog = ({
  activity,
  indicators,
  journeyStages,
  open,
  projectId,
  users,
  onCreatedOrUpdated,
  onOpenChange,
}: {
  activity: Activity | null
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  open: boolean
  projectId: string
  users: UserRecord[]
  onCreatedOrUpdated: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
}) => {
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const projectOfficers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.role === 'Project Officer' &&
          user.accountStatus === 'Active' &&
          user.projectIds.includes(projectId),
      ),
    [projectId, users],
  )
  const officerNames = useMemo(() => projectOfficers.map((user) => user.name), [projectOfficers])
  const indicatorIds = useMemo(() => indicators.map((indicator) => indicator.id), [indicators])
  const journeyStageIds = useMemo(() => journeyStages.map((stage) => stage.id), [journeyStages])
  const formSchema = useMemo(
    () => createActivityFormSchema({ indicatorIds, journeyStageIds, officerNames }),
    [indicatorIds, journeyStageIds, officerNames],
  )
  const form = useForm<ActivityFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })
  const draftStorageKey = `pathways.activityDraft.${projectId}.${activity?.id ?? 'new'}`
  const initialValues = useMemo<ActivityFormSchema>(
    () =>
      activity
        ? {
            title: activity.title,
            description: activity.description,
            startDate: activity.startDate,
            dueDate: activity.dueDate,
            targetBeneficiaries: activity.targetBeneficiaries,
            budgetAllocation: activity.budgetAllocation,
            assignedOfficers: activity.assignedTo.filter((officer) =>
              officerNames.includes(officer),
            ),
            connectedIndicators: activity.indicatorIds.filter((indicatorId) =>
              indicatorIds.includes(indicatorId),
            ),
            journeyStageId: journeyStageIds.includes(activity.journeyStageId)
              ? activity.journeyStageId
              : '',
            status: activity.status,
            progress: activity.progress,
            beneficiariesReached: activity.beneficiariesReached,
            budgetLogged: activity.budgetLogged,
          }
        : defaultValues,
    [activity, indicatorIds, journeyStageIds, officerNames],
  )

  useEffect(() => {
    if (!open) {
      setDraftHydrated(false)
      setDraftRecovered(false)
      return
    }

    let nextValues = initialValues
    try {
      const stored = window.sessionStorage.getItem(draftStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<keyof ActivityFormSchema, unknown>>
        const restored = { ...initialValues }

        for (const key of Object.keys(initialValues) as Array<keyof ActivityFormSchema>) {
          const value = parsed[key]
          const baseline = initialValues[key]
          if (Array.isArray(baseline) && Array.isArray(value)) {
            Object.assign(restored, { [key]: value.filter((item) => typeof item === 'string') })
          } else if (typeof value === typeof baseline) {
            Object.assign(restored, { [key]: value })
          }
        }

        restored.assignedOfficers = restored.assignedOfficers.filter((officer) =>
          officerNames.includes(officer),
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
      window.sessionStorage.removeItem(draftStorageKey)
    }

    form.reset(nextValues)
    setDraftHydrated(true)
  }, [draftStorageKey, form, indicatorIds, initialValues, journeyStageIds, officerNames, open])

  useEffect(() => {
    if (!open || !draftHydrated) {
      return
    }

    const subscription = form.watch((values) => {
      const nextValues = values as ActivityFormSchema
      if (JSON.stringify(nextValues) === JSON.stringify(initialValues)) {
        window.sessionStorage.removeItem(draftStorageKey)
      } else {
        window.sessionStorage.setItem(draftStorageKey, JSON.stringify(nextValues))
      }
    })

    return () => subscription.unsubscribe()
  }, [draftHydrated, draftStorageKey, form, initialValues, open])

  const onSubmit = async (values: ActivityFormSchema) => {
    // TODO(RBAC): Enforce create, edit, review, and approval permissions.
    // TODO(ALERTS): Recalculate overdue and progress alerts server-side.
    try {
      const savedActivity = activity
        ? await pathwaysClient.updateActivity({
            id: activity.id,
            projectId,
            title: values.title,
            description: values.description,
            startDate: values.startDate,
            dueDate: values.dueDate,
            targetBeneficiaries: values.targetBeneficiaries,
            budgetAllocation: values.budgetAllocation,
            assignedTo: values.assignedOfficers,
            indicatorIds: values.connectedIndicators,
            journeyStageId: values.journeyStageId,
            status: values.status as ActivityStatus,
            progress: values.progress,
            beneficiariesReached: values.beneficiariesReached,
            budgetLogged: values.budgetLogged,
          })
        : await pathwaysClient.createActivity({
            projectId,
            title: values.title,
            description: values.description,
            startDate: values.startDate,
            dueDate: values.dueDate,
            targetBeneficiaries: values.targetBeneficiaries,
            budgetAllocation: values.budgetAllocation,
            assignedTo: values.assignedOfficers,
            indicatorIds: values.connectedIndicators,
            journeyStageId: values.journeyStageId,
          })

      toast.success(activity ? 'Activity updated.' : 'Activity created.', {
        description: `${savedActivity.title} is available in this prototype session.`,
      })
      window.sessionStorage.removeItem(draftStorageKey)
      onCreatedOrUpdated(savedActivity)
      onOpenChange(false)
    } catch {
      toast.error('Activity could not be saved.', {
        description: 'Keep the dialog open and try again.',
      })
    }
  }

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && form.formState.isDirty) {
      setDiscardDialogOpen(true)
      return
    }

    onOpenChange(nextOpen)
  }

  const discardChanges = () => {
    window.sessionStorage.removeItem(draftStorageKey)
    form.reset(form.getValues())
    setDiscardDialogOpen(false)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog onOpenChange={requestOpenChange} open={open}>
        <DialogShell
          title={activity ? 'Edit activity' : 'Create activity'}
          description="Save a temporary activity for this project workspace demonstration."
        >
          <Form {...form}>
            <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
              {draftRecovered ? (
                <output
                  aria-atomic="true"
                  aria-live="polite"
                  className="block rounded-lg border border-info/20 bg-info/10 p-3 text-sm text-info"
                >
                  Recovered your unsaved activity draft from this browser tab.
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
                      <FormLabel required>Target beneficiaries</FormLabel>
                      <FormControl aria-required="true">
                        <Input min={1} type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="budgetAllocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Activity budget</FormLabel>
                      <FormControl aria-required="true">
                        <Input min={1} step="1000" type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {activity ? (
                  <>
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl aria-required="true">
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {activityStatuses.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="progress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Progress</FormLabel>
                          <FormControl aria-required="true">
                            <Input max={100} min={0} type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="beneficiariesReached"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Beneficiaries reached</FormLabel>
                          <FormControl aria-required="true">
                            <Input min={0} type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="budgetLogged"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Logged budget</FormLabel>
                          <FormControl aria-required="true">
                            <Input min={0} step="1000" type="number" {...field} />
                          </FormControl>
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
                        <fieldset className="space-y-2 rounded-md border border-input bg-background p-3">
                          <legend className="px-1 text-sm font-medium text-foreground">
                            Assigned officers
                            <span aria-hidden="true" className="ml-1 text-danger">
                              *
                            </span>
                            <span className="sr-only"> (required)</span>
                          </legend>
                          {projectOfficers.length > 0 ? (
                            projectOfficers.map((officer) => (
                              <label
                                className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
                                key={officer.id}
                              >
                                <input
                                  checked={field.value.includes(officer.name)}
                                  className="h-4 w-4 rounded border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onBlur={field.onBlur}
                                  onChange={(event) =>
                                    field.onChange(
                                      event.target.checked
                                        ? [...field.value, officer.name]
                                        : field.value.filter((name) => name !== officer.name),
                                    )
                                  }
                                  type="checkbox"
                                  value={officer.name}
                                />
                                <span>
                                  <span className="font-medium text-foreground">
                                    {officer.name}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {officer.email}
                                  </span>
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
                <FormField
                  control={form.control}
                  name="connectedIndicators"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormControl aria-required="true">
                        <fieldset className="space-y-2 rounded-md border border-input bg-background p-3">
                          <legend className="px-1 text-sm font-medium text-foreground">
                            Connected indicators
                            <span aria-hidden="true" className="ml-1 text-danger">
                              *
                            </span>
                            <span className="sr-only"> (required)</span>
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
                        Choose one or more indicators configured for this project.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="journeyStageId"
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
                      <FormLabel required>Journey stage</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl aria-required="true">
                          <SelectTrigger>
                            <SelectValue placeholder="Select a project journey stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {journeyStages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.code} — {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Options come from this project&apos;s Beneficiary Journey Tracking setup.
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
