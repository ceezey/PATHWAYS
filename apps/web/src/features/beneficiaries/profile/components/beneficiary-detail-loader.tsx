'use client'

import { ShieldAlert, UserRoundX } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { AsyncState, StatusMessage } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { activitiesClient } from '@/lib/api/activities'
import { beneficiariesClient } from '@/lib/api/beneficiaries'
import { PathwaysClientError } from '@/lib/api/core/request'
import { evaluationsClient } from '@/lib/api/evaluations'
import type { AssessmentSummary } from '@/lib/api/evaluations.schema'
import { formsClient } from '@/lib/api/forms'
import { journeysClient } from '@/lib/api/journeys'
import { projectsClient } from '@/lib/api/projects'
import { STEP_UP_COMPLETED_EVENT } from '@/lib/auth/beneficiary-step-up-events'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import type {
  ActivitySummary,
  BeneficiaryAssessmentRecord,
  BeneficiaryRecord,
  DigitalFormDefinition,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { assessmentTypeLabel } from '../../beneficiaries.utils'
import { mapBeneficiaryJourneyHistory } from '../profile.utils'
import { BeneficiaryDetail } from './beneficiary-detail'

type DetailData = {
  beneficiary: BeneficiaryRecord
  projects: ProjectSummary[]
  activities: ActivitySummary[]
  stages: JourneyStageConfig[]
  participationForms: DigitalFormDefinition[]
  projectId: string
  assessmentsUnavailable: boolean
}

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; data: DetailData }
  | { status: 'restricted' }
  | { status: 'unavailable' }
  | { status: 'error' }

const TRANSIENT_RETRY_DELAY_MS = 1_000
const isTransientFailure = (error: unknown) =>
  !(error instanceof PathwaysClientError) || error.code === 'network'

/** Waits for every read, so a denial or miss in any read outranks a busy one. */
const settleAll = async <T extends readonly unknown[] | []>(
  reads: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> => {
  const results = await Promise.allSettled(reads)
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length > 0) throw failures.find((error) => !isTransientFailure(error)) ?? failures[0]
  return results.map((result) => (result as PromiseFulfilledResult<unknown>).value) as {
    -readonly [K in keyof T]: Awaited<T[K]>
  }
}

const toAssessmentRecord =
  (beneficiaryId: string, projectId: string) =>
  (row: AssessmentSummary): BeneficiaryAssessmentRecord => ({
    id: row.id,
    beneficiaryId,
    projectId,
    stageId: row.stageId ?? '',
    type: row.type,
    title: assessmentTypeLabel[row.type],
    assessedAt: row.assessmentDate,
    score: Number(row.score),
    maximumScore: Number(row.maximumScore),
    source: 'Assessment result',
    note: '',
  })

export const BeneficiaryDetailLoader = ({
  beneficiaryId,
  projectId,
}: {
  beneficiaryId: string
  projectId?: string
}) => {
  const { role, profile } = useCurrentRole()
  const canReadForms = principalHasAtomicPermission(profile, 'forms.read')
  const canReadAssessments = isUiActionAvailable(role, 'assessments.detail.view', profile)
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!role) return
    const verifiedRole = role
    void loadAttempt
    let active = true
    const controller = new AbortController()

    const loadDetail = async (retried: boolean): Promise<void> => {
      setState({ status: 'loading' })
      // A swallowed assessment denial still blocks the retry, so no denied read is sent twice.
      let denied = false

      try {
        const readRecord = async (candidateId: string) => {
          try {
            return await beneficiariesClient.getBeneficiaryRecordForRole(
              verifiedRole,
              candidateId,
              beneficiaryId,
            )
          } catch (error) {
            if (error instanceof PathwaysClientError && error.code === 'not_found') return undefined
            throw error
          }
        }
        let beneficiary: BeneficiaryRecord | undefined
        let scopedProjectId: string | undefined
        let projects: ProjectSummary[]
        if (projectId) {
          // A known project needs no list lookup first, so both reads share one round trip.
          const [listed, record] = await settleAll([
            projectsClient.getProjectsForRole(verifiedRole),
            readRecord(projectId),
          ])
          projects = listed
          if (projects.some((project) => project.id === projectId)) {
            beneficiary = record
            scopedProjectId = projectId
          }
        } else {
          projects = await projectsClient.getProjectsForRole(verifiedRole)
          for (const project of projects) {
            beneficiary = await readRecord(project.id)
            if (beneficiary) {
              scopedProjectId = project.id
              break
            }
          }
        }
        if (!beneficiary || !scopedProjectId) {
          throw new PathwaysClientError('Beneficiary not found.', 'not_found')
        }
        const enrollmentId = beneficiary.enrollments.find(
          (enrollment) => enrollment.projectId === scopedProjectId,
        )?.id
        let assessmentsUnavailable = false
        // A denied or failed assessment read leaves the page usable and says so on the button.
        const readAssessments =
          canReadAssessments && enrollmentId
            ? evaluationsClient
                .getBeneficiaryAssessments(scopedProjectId, enrollmentId, controller.signal)
                .then((rows) => rows.map(toAssessmentRecord(beneficiaryId, scopedProjectId)))
                .catch((error: unknown): BeneficiaryAssessmentRecord[] => {
                  assessmentsUnavailable = true
                  if (!isTransientFailure(error)) denied = true
                  return []
                })
            : Promise.resolve([])
        const [activities, stages, history, forms, assessments] = await settleAll([
          activitiesClient.getActivities(scopedProjectId),
          journeysClient.getJourneyStages(scopedProjectId),
          journeysClient.getBeneficiaryJourneyHistory(scopedProjectId, beneficiaryId),
          canReadForms ? formsClient.getDigitalForms(scopedProjectId) : Promise.resolve([]),
          readAssessments,
        ])
        const journey = mapBeneficiaryJourneyHistory(history)

        if (active) {
          setState({
            status: 'ready',
            data: {
              beneficiary: { ...beneficiary, ...journey, assessments },
              projects,
              projectId: scopedProjectId,
              participationForms: forms.filter(
                (form) => form.formType === 'ACTIVITY_MONITORING' && form.status === 'PUBLISHED',
              ),
              activities,
              stages,
              assessmentsUnavailable,
            },
          })
        }
      } catch (error) {
        if (!active) {
          return
        }
        // A cold server or busy pool often clears within a second; denials and misses stay final.
        if (!retried && !denied && isTransientFailure(error)) {
          await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS))
          if (active) await loadDetail(true)
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

    void loadDetail(false)

    return () => {
      active = false
      controller.abort()
    }
  }, [beneficiaryId, loadAttempt, projectId, role, canReadForms, canReadAssessments])

  // Re-reads only the assessments, keeping the page and selected stage.
  const refreshAssessments = useCallback(async () => {
    if (state.status !== 'ready' || !canReadAssessments) return
    const { beneficiary, projectId: scoped } = state.data
    const enrollmentId = beneficiary.enrollments.find((item) => item.projectId === scoped)?.id
    if (!enrollmentId) return
    const rows = await evaluationsClient.getBeneficiaryAssessments(scoped, enrollmentId)
    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            data: {
              ...current.data,
              assessmentsUnavailable: false,
              beneficiary: {
                ...current.data.beneficiary,
                assessments: rows.map(toAssessmentRecord(beneficiary.id, scoped)),
              },
            },
          }
        : current,
    )
  }, [state, canReadAssessments])

  // A completed step-up re-reads the assessments once an earlier read was denied.
  useEffect(() => {
    if (state.status !== 'ready' || !state.data.assessmentsUnavailable) return
    const onCompleted = () => void refreshAssessments().catch(() => undefined)
    window.addEventListener(STEP_UP_COMPLETED_EVENT, onCompleted)
    return () => window.removeEventListener(STEP_UP_COMPLETED_EVENT, onCompleted)
  }, [state, refreshAssessments])

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
        <BeneficiaryDetail {...state.data} refreshAssessments={refreshAssessments} />
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
    <div className="flex min-h-state items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
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
