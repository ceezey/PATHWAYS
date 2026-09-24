'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
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
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectDetail, ProjectStatus } from '@/types/pathways'

import {
  type ProjectSetupSchema,
  projectSetupSchema,
  toCreateProjectInput,
  toUpdateProjectInput,
} from './project-form-validation'
import { ProjectTeamSelectors } from './project-team-selectors'

const projectStatuses: ProjectStatus[] = ['Active', 'Needs Attention', 'Planned', 'Completed']
const projectDraftStorageKey = 'pathways.projectSetupDraft'
const projectDraftFields = [
  'objectives',
  'targetGoal',
  'title',
  'area',
  'startDate',
  'endDate',
  'status',
  'description',
] as const
const projectDefaultValues: ProjectSetupSchema = {
  objectives: '',
  partners: '',
  projectBudget: '',
  targetBeneficiaries: '',
  targetGoal: '',
  title: '',
  sector: '',
  area: '',
  startDate: '',
  endDate: '',
  status: 'Planned',
  description: '',
  programManager: '',
  projectManager: '',
  monitoringOfficer: '',
  projectOfficers: '',
}

export const ProjectSetupForm = ({ projectId }: { projectId?: string }) => {
  const router = useRouter()
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const [existingProject, setExistingProject] = useState<ProjectDetail | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const form = useForm<ProjectSetupSchema>({
    resolver: zodResolver(projectSetupSchema),
    defaultValues: projectDefaultValues,
  })

  useEffect(() => {
    if (projectId) {
      void pathwaysClient
        .getProject(projectId)
        .then((project) => {
          setExistingProject(project)
          form.reset({
            ...projectDefaultValues,
            title: project.title,
            objectives: project.objectives ?? '',
            targetGoal: project.targetGoal ?? '',
            area: project.area === 'Area not recorded' ? '' : project.area,
            startDate: project.startDate ?? '',
            endDate: project.endDate ?? '',
            status: project.status,
            description: project.description,
          })
        })
        .catch(() => {
          form.setError('title', { message: 'The project could not be loaded from the service.' })
        })
      setDraftHydrated(true)
      return
    }
    try {
      const stored = window.sessionStorage.getItem(projectDraftStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<keyof ProjectSetupSchema, unknown>>
        const restored = { ...projectDefaultValues }

        for (const key of projectDraftFields) {
          const value = parsed[key]
          if (typeof value === 'string') {
            Object.assign(restored, { [key]: value })
          }
        }

        if (!projectStatuses.includes(restored.status)) {
          restored.status = projectDefaultValues.status
        }

        form.reset(restored)
        setDraftRecovered(true)
      }
    } catch {
      window.sessionStorage.removeItem(projectDraftStorageKey)
    } finally {
      setDraftHydrated(true)
    }
  }, [form, projectId])

  useEffect(() => {
    if (!draftHydrated || projectId) {
      return
    }

    const subscription = form.watch((values) => {
      const nextValues = values as ProjectSetupSchema
      const draft = Object.fromEntries(projectDraftFields.map((key) => [key, nextValues[key]]))
      const emptyDraft = Object.fromEntries(
        projectDraftFields.map((key) => [key, projectDefaultValues[key]]),
      )
      if (JSON.stringify(draft) === JSON.stringify(emptyDraft)) {
        window.sessionStorage.removeItem(projectDraftStorageKey)
      } else {
        window.sessionStorage.setItem(projectDraftStorageKey, JSON.stringify(draft))
      }
    })

    return () => subscription.unsubscribe()
  }, [draftHydrated, form, projectId])

  const onSubmit = async (values: ProjectSetupSchema) => {
    setSaveError(null)
    if (projectId && !existingProject) {
      setSaveError('The current project must finish loading before it can be updated.')
      return
    }
    if (values.targetGoal === '' && (!existingProject || existingProject.targetGoal !== null)) {
      form.setError('targetGoal', {
        message: 'Enter a percentage greater than 0 and at most 100.',
      })
      return
    }

    try {
      const project = existingProject
        ? await pathwaysClient.updateProject(
            projectId ?? existingProject.id,
            toUpdateProjectInput(values, existingProject),
          )
        : await pathwaysClient.createProject(toCreateProjectInput(values))
      if (!projectId) window.sessionStorage.removeItem(projectDraftStorageKey)
      toast.success(existingProject ? 'Project profile updated.' : 'Project profile created.')
      router.push(`/projects/${project.id}`)
    } catch (error) {
      const message =
        error instanceof PathwaysClientError || error instanceof Error
          ? error.message
          : 'The project profile could not be saved.'
      setSaveError(message)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Project setup"
        title={projectId ? 'Edit project profile' : 'Create project'}
        description="Save supported project information and the delivery period. Deferred profile and team fields remain visible as unavailable."
        actions={
          <Button asChild className="gap-2" variant="outline">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Projects
            </Link>
          </Button>
        }
      />
      {draftRecovered ? (
        <output
          aria-atomic="true"
          aria-live="polite"
          className="mb-4 block rounded-sm border border-info/25 bg-info-subtle p-3 text-sm text-info"
        >
          Recovered your unsaved project draft.
        </output>
      ) : null}
      <SectionCard
        title="Project information"
        description="Required fields are validated before the project is saved."
      >
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {saveError ? (
              <p
                className="rounded-sm border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
                role="alert"
              >
                {saveError}
              </p>
            ) : null}
            <div className="grid gap-5 lg:grid-cols-2">
              <FormField
                control={form.control}
                name="objectives"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Objectives</FormLabel>
                    <FormControl aria-required="true">
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetGoal"
                render={({ field }) => {
                  const required = !existingProject || existingProject.targetGoal !== null
                  return (
                    <FormItem>
                      <FormLabel required={required}>Project target goal (%)</FormLabel>
                      <FormControl aria-required={required}>
                        <Input max="100" min="0.0001" step="0.0001" type="number" {...field} />
                      </FormControl>
                      <FormDescription>
                        Percentage benchmark used to compare Activity and Indicator progress.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />
              {(['partners', 'projectBudget', 'targetBeneficiaries'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {name === 'projectBudget'
                          ? 'Project budget (PHP)'
                          : name === 'targetBeneficiaries'
                            ? 'Target beneficiaries'
                            : 'Implementing partners'}
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled
                          min={
                            name === 'projectBudget' || name === 'targetBeneficiaries'
                              ? '1'
                              : undefined
                          }
                          type={
                            name === 'projectBudget' || name === 'targetBeneficiaries'
                              ? 'number'
                              : 'text'
                          }
                          step={name === 'projectBudget' ? '0.01' : undefined}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This field is unavailable until its server contract is defined.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Project title</FormLabel>
                    <FormControl aria-required="true">
                      <Input placeholder="Community Resilience Project" {...field} />
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
                      <Input disabled placeholder="Education and Skills" {...field} />
                    </FormControl>
                    <FormDescription>
                      This field is unavailable until its server contract is defined.
                    </FormDescription>
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
                      <Input
                        placeholder="Short project purpose and implementation scope"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="space-y-4 rounded-sm border border-border bg-surface-subtle p-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Project team</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assigned names identify the project team and do not create user accounts.
                </p>
              </div>
              <ProjectTeamSelectors
                control={form.control}
                loadError={null}
                loading={false}
                onRetry={() => undefined}
                unavailableMessage="Team assignment changes are unavailable in the current project API."
                users={[]}
              />
            </div>
            <div className="flex justify-end">
              <Button
                className="gap-2"
                disabled={form.formState.isSubmitting || Boolean(projectId && !existingProject)}
                type="submit"
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {form.formState.isSubmitting
                  ? projectId
                    ? 'Saving...'
                    : 'Creating...'
                  : projectId
                    ? 'Save Project'
                    : 'Create Project'}
              </Button>
            </div>
          </form>
        </Form>
      </SectionCard>
    </>
  )
}
