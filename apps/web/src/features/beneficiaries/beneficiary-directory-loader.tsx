'use client'

import { UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AsyncState } from '@/components/pathways'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { BeneficiaryDirectory } from './beneficiary-directory'

type DirectoryData = {
  beneficiaries: BeneficiaryRecord[]
  projects: ProjectSummary[]
  activities: Activity[]
  stages: JourneyStageConfig[]
}

const emptyDirectoryData: DirectoryData = {
  beneficiaries: [],
  projects: [],
  activities: [],
  stages: [],
}

export const BeneficiaryDirectoryLoader = () => {
  const { role } = useCurrentRole()
  const [data, setData] = useState<DirectoryData>(emptyDirectoryData)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!role) return
    const verifiedRole = role
    void loadAttempt
    let active = true

    const loadDirectory = async () => {
      setLoading(true)
      setFailed(false)

      try {
        const projects = await pathwaysClient.getProjectsForRole(verifiedRole)
        const [beneficiaryGroups, activityGroups, stageGroups] = await Promise.all([
          Promise.all(
            projects.map((project) =>
              pathwaysClient.getBeneficiaryRecordsForRole(verifiedRole, project.id),
            ),
          ),
          Promise.all(projects.map((project) => pathwaysClient.getActivities(project.id))),
          Promise.all(projects.map((project) => pathwaysClient.getJourneyStages(project.id))),
        ])

        if (active) {
          setData({
            beneficiaries: beneficiaryGroups.flat(),
            projects,
            activities: activityGroups.flat(),
            stages: stageGroups.flat(),
          })
        }
      } catch {
        if (active) {
          setFailed(true)
          setData(emptyDirectoryData)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadDirectory()

    return () => {
      active = false
    }
  }, [loadAttempt, role])

  if (loading) {
    return (
      <AsyncState
        description="Loading the beneficiary records available to this account."
        icon={UsersRound}
        status="loading"
        title="Loading Beneficiary records"
      />
    )
  }

  if (failed) {
    return (
      <AsyncState
        description="The scoped records could not be loaded. Check your connection and try again."
        icon={UsersRound}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="Beneficiary records unavailable"
      />
    )
  }

  return <BeneficiaryDirectory {...data} />
}
