'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard, StatusBadge } from '@/components/pathways'
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
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { ProjectStatus } from '@/types/pathways'

import { type ProjectSetupSchema, projectSetupSchema } from './project-form-validation'

const projectStatuses: ProjectStatus[] = ['Active', 'Needs Attention', 'Planned', 'Completed']
const projectDraftStorageKey = 'pathways.projectSetupDraft'
const projectDefaultValues: ProjectSetupSchema = {
  title: '',
  sector: '',
  area: '',
  startDate: '',
  endDate: '',
  status: 'Planned',
  budgetCode: '',
  description: '',
  programManager: 'Program Manager A',
  projectManager: 'Project Manager A',
  monitoringOfficer: 'Monitoring and Evaluation Officer A',
  projectOfficers: '',
}

export const ProjectSetupForm = () => {
  const router = useRouter()
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const form = useForm<ProjectSetupSchema>({
    resolver: zodResolver(projectSetupSchema),
    defaultValues: projectDefaultValues,
  })

  useEffect(() => {
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
  }, [form])

  useEffect(() => {
    if (!draftHydrated) {
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
  }, [draftHydrated, form])

  const onSubmit = async (values: ProjectSetupSchema) => {
    // TODO(BACKEND): Submit project creation to NestJS projects endpoint.
    // TODO(RBAC): Restrict project creation to authorized roles.
    // TODO(DATABASE): Persist project and project-team relationships.
    const project = await pathwaysClient.createProject({
      ...values,
      projectOfficers: values.projectOfficers
        .split(',')
        .map((officer) => officer.trim())
        .filter(Boolean),
    })

    toast.success('Prototype project created.', {
      description: `${project.title} is available during this browser session.`,
    })
    window.sessionStorage.removeItem(projectDraftStorageKey)
    router.push(`/projects/${project.id}`)
  }

  return (
    <>
      <PageHeader
        eyebrow="Project setup"
        title="Create project"
        description="Create a temporary project record for this browser session."
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
          className="mb-4 block rounded-lg border border-info/20 bg-info/10 p-3 text-sm text-info"
        >
          Recovered your unsaved project draft from this browser tab.
        </output>
      ) : null}
      <SectionCard
        title="Project information"
        description="Required fields are validated before the temporary project is created."
        actions={<StatusBadge tone="info">Prototype only</StatusBadge>}
      >
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
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
                name="budgetCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Budget code</FormLabel>
                    <FormControl aria-required="true">
                      <Input placeholder="PRJ-2026-001" {...field} />
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
            <div className="space-y-4 rounded-lg border border-border bg-background p-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Project team</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Names are prototype labels and do not create user accounts.
                </p>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <FormField
                  control={form.control}
                  name="programManager"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Program Manager</FormLabel>
                      <FormControl aria-required="true">
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="projectManager"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Project Manager</FormLabel>
                      <FormControl aria-required="true">
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="monitoringOfficer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Monitoring and Evaluation Officer</FormLabel>
                      <FormControl aria-required="true">
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="projectOfficers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Project Officers</FormLabel>
                      <FormControl aria-required="true">
                        <Input placeholder="Project Officer A, Project Officer B" {...field} />
                      </FormControl>
                      <FormDescription>
                        Separate multiple Project Officers with commas.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
