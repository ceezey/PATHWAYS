'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
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
import { saveProject } from '@/lib/demo-state/projects'
import { getDemoState } from '@/lib/demo-state/store'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { ProjectStatus, UserRecord } from '@/types/pathways'

import {
  type ProjectSetupSchema,
  projectSetupSchema,
  toCreateProjectInput,
} from './project-form-validation'
import { ProjectTeamSelectors, validateProjectTeamSelections } from './project-team-selectors'

const projectStatuses: ProjectStatus[] = ['Active', 'Needs Attention', 'Planned', 'Completed']
const projectDraftStorageKey = 'pathways.projectSetupDraft'
const projectDefaultValues: ProjectSetupSchema = {
  objectives: '',
  partners: '',
  projectBudget: '',
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
  const [teamUsers, setTeamUsers] = useState<UserRecord[]>([])
  const [teamDirectoryStatus, setTeamDirectoryStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const teamDirectoryRequested = useRef(false)
  const form = useForm<ProjectSetupSchema>({
    resolver: zodResolver(projectSetupSchema),
    defaultValues: projectDefaultValues,
  })

  const loadTeamDirectory = useCallback(async () => {
    setTeamDirectoryStatus('loading')

    try {
      const users = await pathwaysClient.getUsers()
      setTeamUsers(users)
      setTeamDirectoryStatus('ready')
    } catch {
      setTeamDirectoryStatus('error')
    }
  }, [])

  useEffect(() => {
    if (teamDirectoryRequested.current) {
      return
    }

    teamDirectoryRequested.current = true
    void loadTeamDirectory()
  }, [loadTeamDirectory])

  useEffect(() => {
    if (projectId) {
      const project = getDemoState().projects.find((p) => p.id === projectId)
      if (project)
        form.reset({
          ...projectDefaultValues,
          ...project,
          objectives: project.objectives ?? project.description,
          partners: project.partners ?? '',
          projectBudget: String(
            getDemoState().budgets.find((b) => b.projectId === projectId)?.plannedAmount ?? '',
          ),
          startDate: project.startDate ?? '2026-01-01',
          endDate: project.endDate ?? '2026-12-31',
          projectOfficers: project.projectOfficers.join(','),
        })
      setDraftHydrated(true)
      return
    }
    try {
      const stored = window.sessionStorage.getItem(projectDraftStorageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<keyof ProjectSetupSchema, unknown>>
        const restored = { ...projectDefaultValues }

        for (const key of Object.keys(projectDefaultValues) as Array<keyof ProjectSetupSchema>) {
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
      if (JSON.stringify(nextValues) === JSON.stringify(projectDefaultValues)) {
        window.sessionStorage.removeItem(projectDraftStorageKey)
      } else {
        window.sessionStorage.setItem(projectDraftStorageKey, JSON.stringify(nextValues))
      }
    })

    return () => subscription.unsubscribe()
  }, [draftHydrated, form, projectId])

  const onSubmit = async (values: ProjectSetupSchema) => {
    if (teamDirectoryStatus !== 'ready') {
      form.setError('programManager', {
        message: 'Load the team directory before selecting project members.',
        type: 'teamDirectory',
      })
      form.setFocus('programManager')
      return
    }

    const teamErrors = validateProjectTeamSelections(values, teamUsers)
    const teamFields = [
      'programManager',
      'projectManager',
      'monitoringOfficer',
      'projectOfficers',
    ] as const

    for (const fieldName of teamFields) {
      const message = teamErrors[fieldName]
      if (message) {
        form.setError(fieldName, { message, type: 'teamEligibility' })
      }
    }

    const firstInvalidTeamField = teamFields.find((fieldName) => teamErrors[fieldName])
    if (firstInvalidTeamField) {
      form.setFocus(firstInvalidTeamField)
      return
    }

    const duplicate = getDemoState().projects.some(
      (p) =>
        p.id !== projectId && p.title.trim().toLowerCase() === values.title.trim().toLowerCase(),
    )
    if (
      duplicate &&
      !window.confirm('A project with this name exists. Save with the same name? Cancel to revise.')
    )
      return
    try {
      const project = saveProject(
        { ...toCreateProjectInput(values), confirmDuplicate: duplicate },
        projectId,
      )
      toast.success('Project profile and budget saved.')
      window.sessionStorage.removeItem(projectDraftStorageKey)
      router.push(`/projects/${project.id}`)
    } catch (error) {
      form.setError('title', {
        message: error instanceof Error ? error.message : 'Project could not be saved.',
      })
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Project setup"
        title={projectId ? 'Edit project profile' : 'Create project'}
        description="Create the project profile, delivery period, budget, and team assignments."
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
            <div className="grid gap-5 lg:grid-cols-2">
              {(['objectives', 'partners', 'projectBudget'] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>
                        {name === 'projectBudget'
                          ? 'Project budget (PHP)'
                          : name === 'objectives'
                            ? 'Objectives'
                            : 'Implementing partners'}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type={name === 'projectBudget' ? 'number' : 'text'}
                          step={name === 'projectBudget' ? '0.01' : undefined}
                          {...field}
                        />
                      </FormControl>
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
                    <FormLabel required>Sector</FormLabel>
                    <FormControl aria-required="true">
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
                loadError={
                  teamDirectoryStatus === 'error'
                    ? 'The team directory could not be loaded. Retry before assigning members.'
                    : null
                }
                loading={teamDirectoryStatus === 'loading'}
                onRetry={() => void loadTeamDirectory()}
                users={teamUsers}
              />
            </div>
            <div className="flex justify-end">
              <Button className="gap-2" disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {form.formState.isSubmitting ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </form>
        </Form>
      </SectionCard>
    </>
  )
}
