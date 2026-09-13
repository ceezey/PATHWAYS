'use client'

import { FolderLock } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { DigitalFormDefinition, ProjectSummary } from '@/types/pathways'
import { BeneficiaryForm } from './beneficiary-form'

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; projects: ProjectSummary[]; forms: DigitalFormDefinition[] }

export const BeneficiaryFormLoader = () => {
  const { role } = useCurrentRole()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let active = true
    if (!role) return
    setState({ status: 'loading' })
    void pathwaysClient
      .getProjectsForRole(role)
      .then(async (projects) => {
        const groups = await Promise.all(
          projects.map((project) => pathwaysClient.getDigitalForms(project.id)),
        )
        if (active)
          setState({
            status: 'ready',
            projects,
            forms: groups
              .flat()
              .filter(
                (form) =>
                  form.formType === 'BENEFICIARY_REGISTRATION' && form.status === 'PUBLISHED',
              ),
          })
      })
      .catch(() => active && setState({ status: 'failed' }))
    return () => {
      active = false
    }
  }, [role])

  if (!role || state.status === 'loading')
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
        Loading registration forms...
      </p>
    )
  if (state.status === 'failed')
    return (
      <EmptyState
        icon={FolderLock}
        title="Registration unavailable"
        description="Assigned projects or published registration forms could not be loaded."
      />
    )
  if (state.projects.length === 0)
    return (
      <EmptyState
        icon={FolderLock}
        title="No assigned projects"
        description="Registration requires an active project assignment."
      />
    )
  return <BeneficiaryForm projects={state.projects} forms={state.forms} role={role} />
}
