'use client'
import { SourceMutationRecovery } from './source-mutation-recovery'

import { useCurrentRole } from '@/hooks/use-current-role'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { isSourceReplay, sourceMutationTickets } from '@/lib/services/source-mutation'

import { zodResolver } from '@hookform/resolvers/zod'
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

// Mirrors the server-side gate (apps/api/src/modules/auth/authorization-policy.ts,
// canAssignRole/canAuthorizeRole) so the dialog disables fields the actor
// cannot save, instead of letting a rejected PATCH be the only feedback.
import {
  type CanonicalRole,
  canAssignRole,
} from '../../../../api/src/modules/auth/authorization-policy'

import {
  type ProjectSetupSchema,
  projectTeamEditSchema,
  toProjectTeamInput,
  toUpdateProjectInput,
} from './project-form-validation'
import {
  type TeamFieldName,
  ProjectTeamSelectors,
  validateProjectTeamSelections,
} from './project-team-selectors'

// Which project-role field a given assignment field maps to, for the
// canAssignRole check. Program Manager is deliberately excluded: no actor
// (including System Administrator) may assign it through this dialog —
// canAssignRole's own target list never includes PROGRAM_MANAGER.
const assignTargetRoles: Partial<Record<TeamFieldName, CanonicalRole>> = {
  projectManager: 'PROJECT_MANAGER',
  monitoringOfficer: 'MONITORING_AND_EVALUATION_OFFICER',
  projectOfficers: 'PROJECT_OFFICER',
}

const teamFields = [
  'programManager',
  'projectManager',
  'monitoringOfficer',
  'projectOfficers',
] as const

const formDefaults = (project: ProjectDetail): ProjectSetupSchema => ({
  partnerOrganizations:
    project.implementingPartnerRecords?.map((partner) => partner.name).join('\n') ?? '',
  projectBudget: project.projectBudget ?? '',
  targetBeneficiaries:
    project.targetBeneficiaries === undefined ? '' : String(project.targetBeneficiaries),

  title: project.title,
  // The dialog does not expose sector/area/date fields for editing, but the
  // display placeholders below must never be re-submitted as literal values.
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

export const ProjectTeamEditorDialog = ({
  project,
  onUpdated,
}: {
  project: ProjectDetail
  onUpdated: (project: ProjectDetail) => void
}) => {
  const { profile } = useCurrentRole()
  const mutationContext = useSourceMutationContext(
    profile,
    'projects.update',
    project.id,
    JSON.stringify([project.id, project.updatedAt]),
  )
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const form = useForm<ProjectSetupSchema>({
    resolver: zodResolver(projectTeamEditSchema),
    defaultValues: formDefaults(project),
  })
  // A Project Manager must never be able to remove their own project
  // authority from this dialog (the API also enforces this server-side).
  const preventProjectManagerSelfRemoval =
    Boolean(profile?.userId) && profile?.userId === project.projectManagerId

  const actorRole = profile?.roles[0] as CanonicalRole | undefined
  const disallowAssignRoles = (Object.keys(assignTargetRoles) as TeamFieldName[]).filter(
    (field) => {
      const target = assignTargetRoles[field]
      return !target || !actorRole || !canAssignRole(actorRole, target)
    },
  )

  useEffect(() => {
    if (open) form.reset(formDefaults(project))
  }, [form, open, project])

  useEffect(() => {
    if (!open) return
    void loadAttempt
    let active = true
    setLoading(true)
    setLoadError(null)
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
  }, [loadAttempt, open])

  const saveTeam = async (values: ProjectSetupSchema) => {
    if (!mutationContext?.isCurrent()) return
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
      const updated = await pathwaysClient.updateProject(
        project.id,
        {
          ...toUpdateProjectInput(values, project),
          ...toProjectTeamInput(values, users, { clearBlank: true }),
        },
        mutationContext,
      )
      if (!mutationContext.isCurrent()) return
      const record = isSourceReplay(updated) ? await pathwaysClient.getProject(project.id) : updated
      if (!mutationContext.isCurrent()) return
      if (isSourceReplay(updated))
        sourceMutationTickets.finishAcknowledgement(mutationContext, updated.requestId)
      onUpdated(record)
      toast.success('Project team updated.')
      setOpen(false)
    } catch (error) {
      if (!mutationContext?.isCurrent()) return
      toast.error('Project team could not be updated.', {
        description: error instanceof Error ? error.message : 'Try again.',
      })
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
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
            <SourceMutationRecovery
              context={mutationContext}
              prefix={`/projects/${project.id}`}
              onRecovered={async () => {
                const current = await pathwaysClient.getProject(project.id)
                return () => {
                  onUpdated(current)
                  setOpen(false)
                }
              }}
            />
            <ProjectTeamSelectors
              control={form.control}
              disallowAssignRoles={disallowAssignRoles}
              disallowClearRoles={
                preventProjectManagerSelfRemoval ? ['projectManager'] : undefined
              }
              loadError={loadError}
              loading={loading}
              onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
              users={users}
            />
            <DialogFooter>
              <Button onClick={() => setOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || Boolean(loadError) || form.formState.isSubmitting}
              >
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
