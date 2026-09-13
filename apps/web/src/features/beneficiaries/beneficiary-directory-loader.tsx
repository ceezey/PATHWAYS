'use client'

import { UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import { BeneficiaryDirectory } from './beneficiary-directory'

export const BeneficiaryDirectoryLoader = () => {
  const { role } = useCurrentRole()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    if (!role) return
    setLoadingProjects(true)
    setFailed(false)
    void pathwaysClient
      .getProjectsForRole(role)
      .then((rows) => {
        if (!active) return
        setProjects(rows)
        setSelectedProjectId((current) => current || rows[0]?.id || '')
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoadingProjects(false))
    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    let active = true
    if (!role || !selectedProjectId) {
      setBeneficiaries([])
      return
    }
    setLoadingRecords(true)
    setFailed(false)
    void pathwaysClient
      .getBeneficiaryRecordsForRole(role, selectedProjectId)
      .then((rows) => {
        if (active) setBeneficiaries(rows)
      })
      .catch(() => {
        if (active) {
          setBeneficiaries([])
          setFailed(true)
        }
      })
      .finally(() => active && setLoadingRecords(false))
    return () => {
      active = false
    }
  }, [role, selectedProjectId])

  if (loadingProjects) {
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
        Loading assigned projects...
      </p>
    )
  }
  if (failed && projects.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Beneficiary records unavailable"
        description="The authorized project scope could not be loaded."
      />
    )
  }
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No assigned projects"
        description="No beneficiary detail scope is available to this account."
      />
    )
  }
  return (
    <BeneficiaryDirectory
      beneficiaries={beneficiaries}
      projects={projects}
      selectedProjectId={selectedProjectId}
      onProjectChange={setSelectedProjectId}
      loadingRecords={loadingRecords}
    />
  )
}
