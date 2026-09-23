'use client'

import { FolderLock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AsyncState, StatusMessage } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'

import { BeneficiaryForm } from './beneficiary-form'

export const BeneficiaryFormLoader = ({
  beneficiaryId,
  projectId,
}: {
  beneficiaryId?: string
  projectId?: string
}) => {
  const { role } = useCurrentRole()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [beneficiary, setBeneficiary] = useState<BeneficiaryRecord | undefined>()
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'restricted' | 'unavailable' | 'error'
  >('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!role) return
    const verifiedRole = role
    void loadAttempt
    let active = true
    setProjects(null)
    setBeneficiary(undefined)
    setLoadState('loading')

    void pathwaysClient
      .getProjectsForRole(verifiedRole)
      .then(async (nextProjects) => {
        if (!beneficiaryId) return { nextProjects, nextBeneficiary: undefined }
        const candidateProjects = projectId
          ? nextProjects.filter((project) => project.id === projectId)
          : nextProjects
        for (const project of candidateProjects) {
          try {
            const nextBeneficiary = await pathwaysClient.getBeneficiaryRecordForRole(
              verifiedRole,
              project.id,
              beneficiaryId,
            )
            return { nextProjects, nextBeneficiary }
          } catch (error) {
            if (!(error instanceof PathwaysClientError && error.code === 'not_found')) throw error
          }
        }
        throw new PathwaysClientError('Beneficiary not found.', 'not_found')
      })
      .then(({ nextProjects, nextBeneficiary }) => {
        if (active) {
          setProjects(nextProjects)
          setBeneficiary(nextBeneficiary)
          setLoadState('ready')
        }
      })
      .catch((error) => {
        if (active) {
          if (error instanceof PathwaysClientError && error.code === 'forbidden') {
            setLoadState('restricted')
          } else if (error instanceof PathwaysClientError && error.code === 'not_found') {
            setLoadState('unavailable')
          } else {
            setLoadState('error')
          }
        }
      })

    return () => {
      active = false
    }
  }, [beneficiaryId, loadAttempt, projectId, role])

  if (loadState === 'loading') {
    return (
      <AsyncState
        description="Loading the projects available to this account."
        icon={FolderLock}
        status="loading"
        title="Loading assigned projects"
      />
    )
  }

  if (loadState === 'restricted' || loadState === 'unavailable') {
    const restricted = loadState === 'restricted'
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <AsyncState
          description={
            restricted
              ? 'This beneficiary profile is outside the projects assigned to the current role.'
              : 'This beneficiary profile is not available.'
          }
          icon={FolderLock}
          status="empty"
          title={restricted ? 'Beneficiary profile restricted' : 'Beneficiary profile unavailable'}
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    )
  }

  if (loadState === 'error' || projects === null) {
    return (
      <AsyncState
        description="The assigned project choices could not be loaded. Check your connection and try again."
        icon={FolderLock}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="Project choices unavailable"
      />
    )
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <AsyncState
          description="No projects are assigned to this account, so a beneficiary enrollment cannot be started."
          icon={FolderLock}
          status="empty"
          title="No assigned projects available"
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <StatusMessage>Assigned project choices loaded.</StatusMessage>
      <BeneficiaryForm beneficiary={beneficiary} projects={projects} />
    </>
  )
}
