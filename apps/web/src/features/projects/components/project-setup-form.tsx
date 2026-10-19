'use client'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { isSourceReplay, sourceMutationTickets } from '@/lib/api/core/source-mutation'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { PathwaysClientError } from '@/lib/api/core/request'
import { projectsClient } from '@/lib/api/projects'
import { usersClient } from '@/lib/api/users'
import {
  type SensitiveDraftOwner,
  readSensitiveDraft,
  removeSensitiveDraft,
  useSensitiveDraftOwner,
  writeSensitiveDraft,
} from '@/lib/auth/sensitive-drafts'
import { createdSince, fingerprintOf } from '@/lib/forms/pending-create'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { ProjectDetail, ProjectSummary, UserRecord } from '@/types/pathways'

import {
  type ProjectSetupSchema,
  projectSetupSchema,
  projectStatuses,
  toCreateProjectInput,
  toProjectTeamInput,
  toUpdateProjectInput,
} from '../project-form.utils'
import { useInvalidateProjectRead } from '../projects.reads'
import { ProjectTeamSelectors } from '../team/project-team-selectors'
import { hiddenTeamFields } from '../team/team-selection.utils'
import { ProjectSetupFields } from './project-setup-fields'

const projectDraftFields = [
  'partnerOrganizations',
  'projectBudget',
  'targetBeneficiaries',
  'title',
  'sector',
  'area',
  'startDate',
  'endDate',
  'status',
  'description',
  'programManager',
  'projectManager',
  'monitoringOfficer',
  'projectOfficers',
] as const
const projectDefaultValues: ProjectSetupSchema = {
  partnerOrganizations: '',
  projectBudget: '',
  targetBeneficiaries: '',

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

export const ProjectSetupForm = (props: { projectId?: string }) => {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(
    profile,
    'project',
    props.projectId ? 'projects.update' : 'projects.create',
    props.projectId ?? null,
    props.projectId ?? null,
  )
  if (!scope) return <output>Current project access is required.</output>
  return <ProjectSetupFormContent key={scope.key + scope.generation} {...props} scope={scope} />
}
const ProjectSetupFormContent = ({
  projectId,
  scope,
}: { projectId?: string; scope: SensitiveDraftOwner }) => {
  const { profile, refreshAccess } = useCurrentRole()
  const mutationContext = useSourceMutationContext(
    profile,
    'projects.update',
    projectId ?? null,
    projectId ?? null,
  )
  const projectDraftStorageKey = scope.key
  // Mirrors saveProjectBudget in projects.service: a locked budget is shown only when
  // readable and is never sent.
  const canEditBudget =
    principalHasAtomicPermission(profile, 'budgets.create') &&
    (!projectId || principalHasAtomicPermission(profile, 'budgets.update'))
  const canReadBudget = !projectId || principalHasAtomicPermission(profile, 'budgets.read')
  const router = useRouter()
  const invalidateProjectRead = useInvalidateProjectRead()
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRecovered, setDraftRecovered] = useState(false)
  const [existingProject, setExistingProject] = useState<ProjectDetail | null>(null)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null)
  const [usersLoadAttempt, setUsersLoadAttempt] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [projectLoadFailed, setProjectLoadFailed] = useState(false)
  const pendingCreate = usePendingCreate<ProjectSummary>({
    profile,
    kind: 'project',
    projectId: projectId ?? null,
    successMessage: 'Project created',
    findCreated: async (fingerprint, startedAt) =>
      (await projectsClient.getProjects()).find(
        (item) =>
          fingerprintOf(item.title) === fingerprint && createdSince(item.updatedAt, startedAt),
      ),
    onConfirmed: async (record) => {
      removeSensitiveDraft(projectDraftStorageKey)
      await refreshAccess()
      router.push(`/projects/${record.id}`)
    },
  })
  const form = useForm<ProjectSetupSchema>({
    resolver: zodResolver(projectSetupSchema),
    defaultValues: projectDefaultValues,
  })
  const savePending = form.formState.isSubmitting || pendingCreate.confirming

  useEffect(() => {
    if (projectId) {
      void projectsClient
        .getProject(projectId)
        .then((project) => {
          if (!scope.isCurrent()) return
          setExistingProject(project)
          form.reset({
            ...projectDefaultValues,
            title: project.title,
            partnerOrganizations:
              project.implementingPartnerRecords?.map((partner) => partner.name).join('\n') ?? '',
            projectBudget: project.projectBudget ?? '',
            targetBeneficiaries:
              project.targetBeneficiaries === undefined ? '' : String(project.targetBeneficiaries),

            sector: project.sector === 'Sector not recorded' ? '' : project.sector,
            area: project.area === 'Area not recorded' ? '' : project.area,
            startDate: project.startDate ?? '',
            endDate: project.endDate ?? '',
            status: project.status,
            description: project.description,
            programManager: project.programManager === 'Not assigned' ? '' : project.programManager,
            projectManager: project.projectManager === 'Not assigned' ? '' : project.projectManager,
            monitoringOfficer:
              project.monitoringOfficer === 'Not assigned' ? '' : project.monitoringOfficer,
            projectOfficers: project.projectOfficers.join(', '),
          })
        })
        .catch(() => {
          if (!scope.isCurrent()) return
          setProjectLoadFailed(true)
          form.setError('title', { message: 'The project could not be loaded from the service.' })
        })
      setDraftHydrated(true)
      return
    }
    try {
      const stored = readSensitiveDraft(projectDraftStorageKey)
      if (stored) {
        const parsed = stored as Partial<Record<keyof ProjectSetupSchema, unknown>>
        if (stored.projectId !== null) return
        const restored = { ...projectDefaultValues }

        for (const key of projectDraftFields) {
          const value = parsed[key]
          if (typeof value === 'string' && value.length <= 10_000) {
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
      removeSensitiveDraft(projectDraftStorageKey)
    } finally {
      setDraftHydrated(true)
    }
  }, [form, projectId, projectDraftStorageKey, scope.isCurrent])

  useEffect(() => {
    void usersLoadAttempt
    let mounted = true
    setUsersLoading(true)
    setUsersLoadError(null)
    usersClient
      .getUsers()
      .then((records) => {
        if (mounted && scope.isCurrent()) setUsers(records)
      })
      .catch((error: unknown) => {
        if (!mounted || !scope.isCurrent()) return
        setUsersLoadError(
          error instanceof Error ? error.message : 'The team directory could not be loaded.',
        )
      })
      .finally(() => {
        if (mounted && scope.isCurrent()) setUsersLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [usersLoadAttempt, scope.isCurrent])

  useEffect(() => {
    if (!draftHydrated || projectId) {
      return
    }

    const subscription = form.watch((values) => {
      if (!scope.isCurrent()) return
      const nextValues = values as ProjectSetupSchema
      const draft = Object.fromEntries(projectDraftFields.map((key) => [key, nextValues[key]]))
      const emptyDraft = Object.fromEntries(
        projectDraftFields.map((key) => [key, projectDefaultValues[key]]),
      )
      if (JSON.stringify(draft) === JSON.stringify(emptyDraft)) {
        removeSensitiveDraft(projectDraftStorageKey)
      } else {
        writeSensitiveDraft(projectDraftStorageKey, { ...draft, projectId: null }, scope.generation)
      }
    })

    return () => subscription.unsubscribe()
  }, [draftHydrated, form, projectId, projectDraftStorageKey, scope.isCurrent, scope.generation])

  const onSubmit = async (values: ProjectSetupSchema) => {
    if (!scope.isCurrent()) return
    setSaveError(null)
    if (projectId && !existingProject) {
      setSaveError('The current project must finish loading before it can be updated.')
      return
    }

    try {
      const budget = canEditBudget ? {} : { projectBudget: undefined }
      const project = existingProject
        ? await projectsClient.updateProject(
            projectId ?? existingProject.id,
            {
              ...toUpdateProjectInput(values, existingProject),
              ...toProjectTeamInput(values, users),
              ...budget,
            },
            mutationContext ?? undefined,
          )
        : await pendingCreate.submit(fingerprintOf(values.title), () =>
            projectsClient.createProject({
              ...toCreateProjectInput(values),
              ...toProjectTeamInput(values, users),
              ...budget,
            }),
          )
      if (!project) return
      if (!scope.isCurrent()) return
      if (!projectId) removeSensitiveDraft(projectDraftStorageKey)
      // The edited project must not be served from the shared project read.
      if (existingProject) void invalidateProjectRead(projectId ?? existingProject.id)
      toast.success(existingProject ? 'Project profile updated.' : 'Project profile created.')
      if (isSourceReplay(project)) {
        if (!projectId || !mutationContext?.isCurrent()) return
        await projectsClient.getProject(projectId)
        if (!scope.isCurrent() || !mutationContext.isCurrent()) return
        sourceMutationTickets.finishAcknowledgement(mutationContext, project.requestId)
      }
      if (!existingProject) {
        // A newly created project may add this account to assignedProjectIds.
        // Refresh the cached profile before navigating so the route guard does
        // not evaluate the redirect against a stale assignment list.
        await refreshAccess()
      }
      router.push(
        `/projects/${isSourceReplay(project) ? (existingProject?.id ?? projectId) : project.id}`,
      )
    } catch (error) {
      if (!scope.isCurrent()) return
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
        description="Save project information, delivery dates, and supported team assignments."
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
          className="mb-4 block rounded-xl border border-info/25 bg-info-subtle p-3 text-sm text-info"
        >
          Recovered your unsaved project draft.
        </output>
      ) : null}
      <SectionCard
        title="Project information"
        description="Required fields are validated before the project is saved."
      >
        {projectId && !existingProject && !projectLoadFailed ? (
          <AsyncState
            description="Fetching the saved project details."
            status="loading"
            title="Loading project information"
          />
        ) : null}
        <Form {...form}>
          <form
            className={projectId && !existingProject && !projectLoadFailed ? 'hidden' : 'space-y-6'}
            onSubmit={form.handleSubmit(onSubmit)}
          >
            {saveError ? (
              <p
                className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
                role="alert"
              >
                {saveError}
              </p>
            ) : null}
            <ProjectSetupFields
              canEditBudget={canEditBudget}
              canReadBudget={canReadBudget}
              existingBudget={existingProject?.projectBudget ?? ''}
              form={form}
              projectId={projectId}
            />
            <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Project team</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assigned names identify the project team and do not create user accounts.
                </p>
              </div>
              <ProjectTeamSelectors
                hiddenFields={hiddenTeamFields(profile?.roles[0])}
                control={form.control}
                loadError={usersLoadError}
                loading={usersLoading}
                onRetry={() => setUsersLoadAttempt((attempt) => attempt + 1)}
                users={users}
              />
            </div>
            {pendingCreate.notice ? (
              <output className="block rounded-xl border border-info/25 bg-info-subtle p-3 text-sm text-info">
                {pendingCreate.notice}
              </output>
            ) : null}
            <div className="flex justify-end">
              <Button
                className="gap-2"
                disabled={savePending || Boolean(projectId && !existingProject)}
                type="submit"
              >
                {savePending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {savePending
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
