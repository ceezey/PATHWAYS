'use client'

import { ShieldAlert, UserRoundX } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AsyncState, StatusMessage } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type {
  Activity,
  BeneficiaryRecord,
  DigitalFormDefinition,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { BeneficiaryDetail } from './beneficiary-detail'
import { mapBeneficiaryJourneyHistory } from './beneficiary-journey-adapter'

type DetailData = {
  beneficiary: BeneficiaryRecord
  projects: ProjectSummary[]
  activities: Activity[]
  stages: JourneyStageConfig[]
  participationForms: DigitalFormDefinition[]
  projectId: string
}

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; data: DetailData }
  | { status: 'restricted' }
  | { status: 'unavailable' }
  | { status: 'error' }

export const BeneficiaryDetailLoader = ({
  beneficiaryId,
  projectId,
}: {
  beneficiaryId: string
  projectId?: string
}) => {
  const { role } = useCurrentRole()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!role) return
    const verifiedRole = role
    void loadAttempt
    let active = true

    const loadDetail = async () => {
      setState({ status: 'loading' })

      try {
        const projects = await pathwaysClient.getProjectsForRole(verifiedRole)
        let beneficiary: BeneficiaryRecord | undefined
        const candidateProjects = projectId
          ? projects.filter((project) => project.id === projectId)
          : projects
        let scopedProjectId: string | undefined
        for (const project of candidateProjects) {
          try {
            beneficiary = await pathwaysClient.getBeneficiaryRecordForRole(
              verifiedRole,
              project.id,
              beneficiaryId,
            )
            scopedProjectId = project.id
            break
          } catch (error) {
            if (!(error instanceof PathwaysClientError && error.code === 'not_found')) throw error
          }
        }
        if (!beneficiary || !scopedProjectId) {
          throw new PathwaysClientError('Beneficiary not found.', 'not_found')
        }
        const [activities, stages, history, forms] = await Promise.all([
          pathwaysClient.getActivities(scopedProjectId),
          pathwaysClient.getJourneyStages(scopedProjectId),
          pathwaysClient.getBeneficiaryJourneyHistory(scopedProjectId, beneficiaryId),
          pathwaysClient.getDigitalForms(scopedProjectId),
        ])
        const journey = mapBeneficiaryJourneyHistory(history)

        if (active) {
          setState({
            status: 'ready',
            data: {
              beneficiary: { ...beneficiary, ...journey },
              projects,
              projectId: scopedProjectId,
              participationForms: forms.filter(
                (form) => form.formType === 'ACTIVITY_MONITORING' && form.status === 'PUBLISHED',
              ),
              activities,
              stages,
            },
          })
        }
      } catch (error) {
        if (!active) {
          return
        }

        if (error instanceof PathwaysClientError && error.code === 'forbidden') {
          setState({ status: 'restricted' })
        } else if (error instanceof PathwaysClientError && error.code === 'not_found') {
          setState({ status: 'unavailable' })
        } else {
          setState({ status: 'error' })
        }
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [beneficiaryId, loadAttempt, projectId, role])

  if (state.status === 'loading') {
    return (
      <AsyncState
        description="Checking whether this Beneficiary record is available to the current role."
        icon={ShieldAlert}
        status="loading"
        title="Checking Beneficiary record access"
      />
    )
  }

  if (state.status === 'ready') {
    return (
      <>
        <StatusMessage>Beneficiary record loaded.</StatusMessage>
        <BeneficiaryDetail {...state.data} />
      </>
    )
  }

  if (state.status === 'error') {
    return (
      <AsyncState
        description="The Beneficiary record could not be loaded. Check your connection and try again."
        icon={UserRoundX}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="Beneficiary record unavailable"
      />
    )
  }

  const restricted = state.status === 'restricted'

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <AsyncState
          description={
            restricted
              ? 'This record is outside the projects assigned to the current account. No beneficiary details or media were loaded.'
              : 'This Beneficiary record is not available in the current project data.'
          }
          icon={restricted ? ShieldAlert : UserRoundX}
          status="empty"
          title={restricted ? 'Beneficiary record restricted' : 'Beneficiary record unavailable'}
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    </div>
  )
}
