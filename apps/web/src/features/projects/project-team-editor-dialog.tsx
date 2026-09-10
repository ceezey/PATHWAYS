'use client'

import { Pencil, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form } from '@/components/ui/form'
import { reassignProjectTeam } from '@/lib/demo-state/projects'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import type { ProjectDetail, UserRecord } from '@/types/pathways'
import type { PrototypeRole } from '@/types/prototype-role'

import type { ProjectSetupSchema } from './project-form-validation'
import { ProjectTeamSelectors, validateProjectTeamSelections } from './project-team-selectors'

const teamFields = [
  'programManager',
  'projectManager',
  'monitoringOfficer',
  'projectOfficers',
] as const

const formDefaults = (project: ProjectDetail): ProjectSetupSchema => ({
  objectives: project.objectives ?? project.description,
  partners: project.partners ?? 'Existing project partners',
  projectBudget: String(project.projectBudget ?? 1),
  title: project.title,
  sector: project.sector,
  area: project.area,
  startDate: project.startDate ?? '2026-01-01',
  endDate: project.endDate ?? '2026-12-31',
  status: project.status,
  description: project.description,
  programManager: project.programManager,
  projectManager: project.projectManager,
  monitoringOfficer: project.monitoringOfficer,
  projectOfficers: project.projectOfficers.join(', '),
})

const existingTeamMembers = (project: ProjectDetail) => [
  { name: project.programManager, role: 'Program Manager' as const },
  { name: project.projectManager, role: 'Project Manager' as const },
  {
    name: project.monitoringOfficer,
    role: 'Monitoring and Evaluation Officer' as const,
  },
  ...project.projectOfficers.map((name) => ({ name, role: 'Project Officer' as const })),
]

const teamDirectory = (
  accounts: ReturnType<typeof useDemoState>['accounts'],
  project: ProjectDetail,
): UserRecord[] => {
  const users: UserRecord[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    accountStatus: account.status,
    signInMethod: 'Prototype password',
    projectIds: account.projectIds,
    projectAccess: account.projectIds,
    createdAt: '2026-09-09T08:00:00.000Z',
  }))

  for (const member of existingTeamMembers(project)) {
    if (users.some((user) => user.name === member.name && user.role === member.role)) continue
    const slug = member.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')
    users.push({
      id: `existing-${member.role}-${slug}`,
      name: member.name,
      email: `${slug}@pathways.example`,
      role: member.role as PrototypeRole,
      accountStatus: 'Active',
      signInMethod: 'SSO placeholder',
      projectIds: [project.id],
      projectAccess: [project.title],
      createdAt: '2026-01-01T00:00:00.000Z',
    })
  }

  return users
}

export const ProjectTeamEditorDialog = ({ project }: { project: ProjectDetail }) => {
  const demo = useDemoState()
  const [open, setOpen] = useState(false)
  const users = useMemo(() => teamDirectory(demo.accounts, project), [demo.accounts, project])
  const form = useForm<ProjectSetupSchema>({ defaultValues: formDefaults(project) })

  useEffect(() => {
    if (open) form.reset(formDefaults(project))
  }, [form, open, project])

  const saveTeam = (values: ProjectSetupSchema) => {
    form.clearErrors(teamFields)
    const errors = validateProjectTeamSelections(values, users)
    for (const field of teamFields) {
      const message = errors[field]
      if (message) form.setError(field, { message, type: 'teamEligibility' })
    }
    const firstInvalid = teamFields.find((field) => errors[field])
    if (firstInvalid) {
      form.setFocus(firstInvalid)
      return
    }

    try {
      reassignProjectTeam(project.id, {
        programManager: values.programManager,
        projectManager: values.projectManager,
        monitoringOfficer: values.monitoringOfficer,
        projectOfficers: values.projectOfficers
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      })
      toast.success('Project team assignments updated.')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Project team could not be updated.')
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={project.archived} size="sm" type="button" variant="outline">
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
          Edit team
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit project team</DialogTitle>
          <DialogDescription>
            Reassign active members for {project.title}. Changes update this project's access
            and future activity assignment choices.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(saveTeam)}>
            <ProjectTeamSelectors
              control={form.control}
              loadError={null}
              loading={false}
              onRetry={() => undefined}
              users={users}
            />
            <DialogFooter>
              <Button onClick={() => setOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Save assignments
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
