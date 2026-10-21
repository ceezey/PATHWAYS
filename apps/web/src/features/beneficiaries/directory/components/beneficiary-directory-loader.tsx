'use client'

import { UsersRound } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import { AsyncState } from '@/components/pathways'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSafeProjectSelection } from '@/hooks/use-safe-project-selection'
import { beneficiariesClient } from '@/lib/api/beneficiaries'
import { projectsClient } from '@/lib/api/projects'
import { scopeProjectsForRole } from '@/lib/rbac/data-scope'

import { BeneficiaryDirectory } from './beneficiary-directory'

export const BeneficiaryDirectoryLoader = () => {
  const { role, assignedProjectIds } = useCurrentRole()
  const searchParams = useSearchParams()
  const projectsRead = useAuthorizedRead(
    'projects',
    null,
    'projects.read',
    (signal) => projectsClient.getProjects(signal),
    true,
    { freshness: 'summary' },
  )
  const projects = useMemo(
    () =>
      role && projectsRead.data
        ? scopeProjectsForRole(projectsRead.data, role, assignedProjectIds)
        : [],
    [assignedProjectIds, projectsRead.data, role],
  )
  // Selection follows the last resolved list, so a masked re-verify never resets the chosen project.
  const [projectIds, setProjectIds] = useState<string[]>([])
  const resolvedIds = projects.map((project) => project.id)
  if (projectsRead.data && resolvedIds.join('|') !== projectIds.join('|'))
    setProjectIds(resolvedIds)
  const [projectId, setProjectId] = useSafeProjectSelection(
    projectIds,
    searchParams?.get('project') ?? undefined,
  )
  // Only the selected project's records are read; the directory never shows two projects at once.
  const recordsRead = useAuthorizedRead(
    'beneficiary-directory',
    projectId || null,
    'beneficiaries.records.read',
    (signal) =>
      role
        ? beneficiariesClient.getBeneficiaryRecordsForRole(role, projectId, undefined, signal)
        : Promise.resolve([]),
    Boolean(role && projectId),
  )
  // A principal without record access, or without projects, sees an empty directory instead of a stuck load.
  const noAccess = projectId ? !recordsRead.eligible : projects.length === 0
  const records = recordsRead.data ?? (projectsRead.data && noAccess ? [] : undefined)
  const [settled, setSettled] = useState(false)
  if (!settled && records) setSettled(true)

  if (projectsRead.isError || (!settled && recordsRead.isError)) {
    return (
      <AsyncState
        description="The scoped records could not be loaded. Check your connection and try again."
        icon={UsersRound}
        onRetry={() => void (projectsRead.isError ? projectsRead.refetch() : recordsRead.refetch())}
        status="error"
        title="Beneficiary records unavailable"
      />
    )
  }

  if (!settled) {
    return <AsyncState icon={UsersRound} status="loading" title="Loading Beneficiary records" />
  }

  return (
    <BeneficiaryDirectory
      beneficiaries={records ?? []}
      onProjectChange={setProjectId}
      onRetry={() => void recordsRead.refetch()}
      projectId={projectId}
      projects={projects}
      status={recordsRead.isError ? 'error' : records ? 'success' : 'loading'}
    />
  )
}
