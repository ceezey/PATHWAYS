'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
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
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { Activity, ActivityStatus, Indicator, UserRecord } from '@/types/pathways'

import { type ActivityFormSchema, activityFormSchema } from './activity-form-validation'
import { activityStatuses } from './activity-utils'

const splitValues = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const defaultValues: ActivityFormSchema = {
  title: '',
  description: '',
  startDate: '',
  dueDate: '',
  targetBeneficiaries: 1,
  budgetAllocation: 1,
  assignedOfficers: 'Project Officer A',
  connectedIndicators: 'ind-fm-01',
  journeyStageId: 'stage-entry',
  status: 'Planned',
  progress: 0,
  beneficiariesReached: 0,
  budgetLogged: 0,
}

export const ActivityFormDialog = ({
  activity,
  indicators,
  open,
  projectId,
  users,
  onCreatedOrUpdated,
  onOpenChange,
}: {
  activity: Activity | null
  indicators: Indicator[]
  open: boolean
  projectId: string
  users: UserRecord[]
  onCreatedOrUpdated: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
}) => {
  const form = useForm<ActivityFormSchema>({
    resolver: zodResolver(activityFormSchema),
    defaultValues,
  })

  useEffect(() => {
    if (!open) {
      return
    }

    if (activity) {
      form.reset({
        title: activity.title,
        description: activity.description,
        startDate: activity.startDate,
        dueDate: activity.dueDate,
        targetBeneficiaries: activity.targetBeneficiaries,
        budgetAllocation: activity.budgetAllocation,
        assignedOfficers: activity.assignedTo.join(', '),
        connectedIndicators: activity.indicatorIds.join(', '),
        journeyStageId: activity.journeyStageId,
        status: activity.status,
        progress: activity.progress,
        beneficiariesReached: activity.beneficiariesReached,
        budgetLogged: activity.budgetLogged,
      })
      return
    }

    form.reset({
      ...defaultValues,
      connectedIndicators: indicators[0]?.id ?? defaultValues.connectedIndicators,
    })
  }, [activity, form, indicators, open])

  const onSubmit = async (values: ActivityFormSchema) => {
    // TODO(RBAC): Enforce create, edit, review, and approval permissions.
    // TODO(ALERTS): Recalculate overdue and progress alerts server-side.
    const assignedTo = splitValues(values.assignedOfficers)
    const indicatorIds = splitValues(values.connectedIndicators)
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
          assignedTo,
          indicatorIds,
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
          assignedTo,
          indicatorIds,
          journeyStageId: values.journeyStageId,
        })

    toast.success(activity ? 'Activity updated.' : 'Activity created.', {
      description: `${savedActivity.title} is available in this prototype session.`,
    })
    onCreatedOrUpdated(savedActivity)
    onOpenChange(false)
  }

  const projectOfficerNames = users
    .filter((user) => user.role === 'Project Officer')
    .map((user) => user.name)
    .join(', ')

  const indicatorOptions = indicators
    .map((indicator) => `${indicator.id} (${indicator.code})`)
    .join(', ')

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogShell
        title={activity ? 'Edit activity' : 'Create activity'}
        description="Save a temporary frontend-only activity for the project workspace."
      >
        <Form {...form}>
          <form
            className="max-h-[72vh] space-y-5 overflow-y-auto pr-1"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="lg:col-span-2">
                    <FormLabel>Activity title</FormLabel>
                    <FormControl>
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
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <textarea
                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
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
                    <FormLabel>Due date</FormLabel>
                    <FormControl>
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
                    <FormLabel>Activity budget</FormLabel>
                    <FormControl>
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
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
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
                        <FormLabel>Progress</FormLabel>
                        <FormControl>
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
                        <FormLabel>Beneficiaries reached</FormLabel>
                        <FormControl>
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
                        <FormLabel>Logged budget</FormLabel>
                        <FormControl>
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
                    <FormLabel>Assigned officers</FormLabel>
                    <FormControl>
                      <Input placeholder="Project Officer A, Project Officer B" {...field} />
                    </FormControl>
                    <FormDescription>
                      Separate names with commas. Available prototype officers:{' '}
                      {projectOfficerNames || 'Project Officer A'}.
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
                    <FormLabel>Connected indicators</FormLabel>
                    <FormControl>
                      <Input placeholder="ind-fm-01, ind-fm-02" {...field} />
                    </FormControl>
                    <FormDescription>
                      Use indicator IDs. Available for this project:{' '}
                      {indicatorOptions || 'No indicators yet'}.
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
                    <FormLabel>Journey-stage placeholder</FormLabel>
                    <FormControl>
                      <Input placeholder="stage-entry" {...field} />
                    </FormControl>
                    <FormDescription>
                      Placeholder only until beneficiary journey stages are implemented.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
  )
}
