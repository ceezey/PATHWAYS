'use client'

import { ShieldAlert, UserRoundX } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type {
  Activity,
  BeneficiaryMediaProofRecord,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { BeneficiaryDetail } from './beneficiary-detail'

type DetailData = {
  beneficiary: BeneficiaryRecord
  projects: ProjectSummary[]
  activities: Activity[]
  stages: JourneyStageConfig[]
  mediaProof: BeneficiaryMediaProofRecord[]
}

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; data: DetailData }
  | { status: 'restricted' }
  | { status: 'unavailable' }

export const BeneficiaryDetailLoader = ({ beneficiaryId }: { beneficiaryId: string }) => {
  const { role } = usePrototypeRole()
  const [state, setState] = useState<DetailState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    const loadDetail = async () => {
      setState({ status: 'loading' })

      try {
        const beneficiary = await pathwaysClient.getBeneficiaryRecordForRole(role, beneficiaryId)
        const [projects, mediaProof, activityGroups, stageGroups] = await Promise.all([
          pathwaysClient.getProjectsForRole(role),
          pathwaysClient.getBeneficiaryMediaProofForRole(role, beneficiaryId),
          Promise.all(
            beneficiary.projectIds.map((projectId) => pathwaysClient.getActivities(projectId)),
          ),
          Promise.all(
            beneficiary.projectIds.map((projectId) => pathwaysClient.getJourneyStages(projectId)),
          ),
        ])

        if (active) {
          setState({
            status: 'ready',
            data: {
              beneficiary,
              projects,
              mediaProof,
              activities: activityGroups.flat(),
              stages: stageGroups.flat(),
            },
          })
        }
      } catch (error) {
        if (!active) {
          return
        }

        setState({
          status:
            error instanceof PathwaysClientError && error.code === 'forbidden'
              ? 'restricted'
              : 'unavailable',
        })
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [beneficiaryId, role])

  if (state.status === 'loading') {
    return (
      <div
        aria-live="polite"
        className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground"
      >
        Checking Beneficiary record access...
      </div>
    )
  }

  if (state.status === 'ready') {
    return <BeneficiaryDetail {...state.data} />
  }

  const restricted = state.status === 'restricted'

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <EmptyState
          description={
            restricted
              ? 'This record is outside the projects assigned to the current prototype role. No Beneficiary details or media were loaded.'
              : 'This Beneficiary record is not available in the current safe sample data.'
          }
          icon={restricted ? ShieldAlert : UserRoundX}
          title={restricted ? 'Beneficiary record restricted' : 'Beneficiary record unavailable'}
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    </div>
  )
}
