'use client'

import { UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
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

  useEffect(() => {
    let active = true

    const loadDirectory = async () => {
      setLoading(true)
      setFailed(false)

      if (!role) {
        setFailed(true)
        setLoading(false)
        return
      }

      try {
        const [beneficiaries, projects] = await Promise.all([
          pathwaysClient.getBeneficiaryRecordsForRole(role),
          pathwaysClient.getProjectsForRole(role),
        ])
        const [activityGroups, stageGroups] = await Promise.all([
          Promise.all(projects.map((project) => pathwaysClient.getActivities(project.id))),
          Promise.all(projects.map((project) => pathwaysClient.getJourneyStages(project.id))),
        ])

        if (active) {
          setData({
            beneficiaries,
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
  }, [role])

  if (loading) {
    return (
      <div
        aria-live="polite"
        className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground"
      >
        Loading the beneficiary records available to your role...
      </div>
    )
  }

  if (failed) {
    return (
      <EmptyState
        description="Beneficiary records could not be loaded. The backend integration may not be configured."
        icon={UsersRound}
        title="Beneficiary records unavailable"
      />
    )
  }

  return <BeneficiaryDirectory {...data} />
}
