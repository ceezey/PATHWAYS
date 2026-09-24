'use client'

import { Pencil, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectDetail, UserRecord } from '@/types/pathways'

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
  partners: '',
  projectBudget: '',
  targetBeneficiaries: String(project.targetBeneficiaries),
  targetGoal: project.targetGoal ?? '',
  title: project.title,
  sector: project.sector,
  area: project.area,
  startDate: project.startDate ?? '',
  endDate: project.endDate ?? '',
  status: project.status,
  description: project.description,
  programManager: project.programManager,
  projectManager: project.projectManager,
  monitoringOfficer: project.monitoringOfficer,
  projectOfficers: project.projectOfficers.join(', '),
})

export const ProjectTeamEditorDialog = ({ project }: { project: ProjectDetail }) => {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const form = useForm<ProjectSetupSchema>({ defaultValues: formDefaults(project) })

  useEffect(() => {
    if (open) form.reset(formDefaults(project))
  }, [form, open, project])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    pathwaysClient
      .getUsers()
      .then((records) => {
        if (active) {
          setUsers(records)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : 'Users could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

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

    toast.error(
      'Project team reassignment is unavailable in the current API. No assignment was saved.',
    )
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled size="sm" type="button" variant="outline">
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
          Edit team
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit project team</DialogTitle>
          <DialogDescription>
            Reassign active members for {project.title}. Changes update this project's access and
            future activity assignment choices.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(saveTeam)}>
            <ProjectTeamSelectors
              control={form.control}
              loadError={loadError}
              loading={loading}
              onRetry={() => undefined}
              users={users}
            />
            <DialogFooter>
              <Button onClick={() => setOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit" disabled>
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
