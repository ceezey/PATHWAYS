import type { UseFormReturn } from 'react-hook-form'

import { LockedField } from '@/components/pathways'
import {
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
import type {
  Activity,
  AssignableProjectOfficer,
  Indicator,
  JourneyStageConfig,
} from '@/types/pathways'

import { activityStatuses, formatCurrency } from '../activities.utils'
import type { ActivityFormSchema } from '../activity-form.utils'

export const ActivityFormFields = ({
  activity,
  canEditBudget,
  canEditStatus,
  canLinkIndicators,
  canReadBudget,
  canReadIndicators,
  form,
  indicators,
  journeyStages,
  lockedIndicatorValue,
  officers,
}: {
  activity: Activity | null
  canEditBudget: boolean
  canEditStatus: boolean
  canLinkIndicators: boolean
  canReadBudget: boolean
  canReadIndicators: boolean
  form: UseFormReturn<ActivityFormSchema>
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  lockedIndicatorValue: string
  officers: AssignableProjectOfficer[]
}) => (
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
          activity?.budgetAllocation === null || activity?.budgetAllocation === undefined
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
              <FormDescription>Progress changes use the proof review workflow.</FormDescription>
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
              <FormDescription>Server-computed distinct qualifying beneficiaries.</FormDescription>
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
                  placeholder={activity?.budgetLogged === null ? 'Unavailable' : undefined}
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
            <fieldset className="space-y-2 rounded-md border border-border bg-card p-3">
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
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-3 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-info-subtle"
                    key={officer.userId}
                  >
                    <input
                      checked={field.value.includes(officer.userId)}
                      className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <span className="font-medium text-foreground">{officer.displayName}</span>
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
              <fieldset className="space-y-2 rounded-md border border-border bg-card p-3">
                <legend className="px-1 text-sm font-medium text-foreground">
                  Connected indicators
                </legend>
                {indicators.length > 0 ? (
                  indicators.map((indicator) => (
                    <label
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-info-subtle"
                      key={indicator.id}
                    >
                      <input
                        checked={field.value.includes(indicator.id)}
                        className="mt-0.5 h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onBlur={field.onBlur}
                        onChange={(event) =>
                          field.onChange(
                            event.target.checked
                              ? [...field.value, indicator.id]
                              : field.value.filter((indicatorId) => indicatorId !== indicator.id),
                          )
                        }
                        type="checkbox"
                        value={indicator.id}
                      />
                      <span>
                        <span className="font-medium text-foreground">{indicator.code}</span>
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
)
