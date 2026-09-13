'use client'

import { ShieldAlert, UserRoundX } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import { BeneficiaryDetail } from './beneficiary-detail'

type State =
  | { status: 'loading' }
  | {
      status: 'ready'
      beneficiary: BeneficiaryRecord
      projects: ProjectSummary[]
      projectId: string
    }
  | { status: 'restricted' | 'unavailable' }

export const BeneficiaryDetailLoader = ({
  beneficiaryId,
  requestedProjectId,
}: { beneficiaryId: string; requestedProjectId?: string }) => {
  const { role } = useCurrentRole()
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    let active = true
    if (!role) return
    setState({ status: 'loading' })
    void pathwaysClient
      .getProjectsForRole(role)
      .then(async (projects) => {
        const projectId =
          requestedProjectId && projects.some((project) => project.id === requestedProjectId)
            ? requestedProjectId
            : projects[0]?.id
        if (!projectId)
          throw new PathwaysClientError('No project detail scope is available.', 'forbidden')
        const beneficiary = await pathwaysClient.getBeneficiaryRecordForRole(
          role,
          projectId,
          beneficiaryId,
        )
        if (active) setState({ status: 'ready', beneficiary, projects, projectId })
      })
      .catch((cause) => {
        if (!active) return
        setState({
          status:
            cause instanceof PathwaysClientError && ['forbidden', 'not_found'].includes(cause.code)
              ? 'restricted'
              : 'unavailable',
        })
      })
    return () => {
      active = false
    }
  }, [beneficiaryId, requestedProjectId, role])

  if (!role || state.status === 'loading')
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
        Checking Beneficiary record access...
      </p>
    )
  if (state.status === 'ready')
    return (
      <BeneficiaryDetail
        initial={state.beneficiary}
        projects={state.projects}
        projectId={state.projectId}
        role={role}
      />
    )
  const restricted = state.status === 'restricted'
  return (
    <div className="space-y-4">
      <EmptyState
        icon={restricted ? ShieldAlert : UserRoundX}
        title={restricted ? 'Beneficiary record restricted' : 'Beneficiary record unavailable'}
        description={
          restricted
            ? 'No beneficiary details from another project or organization were returned.'
            : 'The record could not be loaded.'
        }
      />
      <Button asChild>
        <Link href="/beneficiaries">Back to Beneficiaries</Link>
      </Button>
    </div>
  )
}
