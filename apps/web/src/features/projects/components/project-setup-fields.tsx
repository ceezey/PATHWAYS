'use client'

import { projectCodeBase } from '@pathways/shared'
import { type UseFormReturn, useWatch } from 'react-hook-form'

import { LockedField } from '@/components/pathways'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { type ProjectSetupSchema, projectStatuses } from '../project-form.utils'

export const ProjectSetupFields = ({
  canEditBudget,
  canReadBudget,
  existingBudget,
  form,
  projectId,
}: {
  canEditBudget: boolean
  canReadBudget: boolean
  existingBudget: string
  form: UseFormReturn<ProjectSetupSchema>
  projectId?: string
}) => (
  <div className="grid gap-5 lg:grid-cols-2">
    <FormField
      control={form.control}
      name="title"
      render={({ field }) => (
        <FormItem>
          <FormLabel required>Project title</FormLabel>
          <FormControl aria-required="true">
            <Input placeholder="Community Resilience Project" {...field} />
          </FormControl>
          {projectId ? null : <ProjectCodePreview form={form} />}
          <FormMessage />
        </FormItem>
      )}
    />

    <FormField
      control={form.control}
      name="partnerOrganizations"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Implementing partners</FormLabel>
          <FormControl>
            <Textarea {...field} placeholder="One organization per line" />
          </FormControl>
          <p className="text-sm text-muted-foreground">
            Each organization receives a stable identifier when saved.
          </p>
          <FormMessage />
        </FormItem>
      )}
    />
    {canEditBudget ? (
      <FormField
        control={form.control}
        name="projectBudget"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Project budget (PHP)</FormLabel>
            <FormControl>
              <Input min="0" step="0.01" type="number" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    ) : canReadBudget ? (
      <LockedField label="Project budget (PHP)" value={existingBudget} />
    ) : null}
    <FormField
      control={form.control}
      name="targetBeneficiaries"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Target beneficiaries</FormLabel>
          <FormControl>
            <Input min="0" type="number" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    <FormField
      control={form.control}
      name="sector"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Sector</FormLabel>
          <FormControl>
            <Input placeholder="Education and Skills" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    <FormField
      control={form.control}
      name="area"
      render={({ field }) => (
        <FormItem>
          <FormLabel required>Implementation area</FormLabel>
          <FormControl aria-required="true">
            <Input placeholder="Metro Manila" {...field} />
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
      name="endDate"
      render={({ field }) => (
        <FormItem>
          <FormLabel required>End date</FormLabel>
          <FormControl aria-required="true">
            <Input type="date" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    <FormField
      control={form.control}
      name="status"
      render={({ field }) => (
        <FormItem>
          <FormLabel required>Project status</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl aria-required="true">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {projectStatuses.map((status) => (
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
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel required>Description</FormLabel>
          <FormControl aria-required="true">
            <Input placeholder="Short project purpose and implementation scope" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </div>
)

// Shows the code the API will generate; a numeric suffix is added on save if it is taken.
const ProjectCodePreview = ({ form }: { form: UseFormReturn<ProjectSetupSchema> }) => {
  const [title, area, startDate] = useWatch({
    control: form.control,
    name: ['title', 'area', 'startDate'],
  })
  if (!title?.trim()) return null
  return (
    <p className="text-xs text-muted-foreground">
      Project code: {projectCodeBase({ title, area, startDate })}
    </p>
  )
}
