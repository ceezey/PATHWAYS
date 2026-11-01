'use client'

import { UsersRound } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import { AsyncState } from '@/components/pathways'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
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
  const [chosenId, setChosenId] = useState('')
  // Starts empty so nothing loads until asked for, unless there is only one project to choose.
  const projectId =
    [chosenId, searchParams?.get('project')].find((id) => id && projectIds.includes(id)) ??
    (projectIds.length === 1 ? (projectIds[0] ?? '') : '')
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
  // With no project selected, or no record access, the directory is empty rather than a stuck load.
  const noRead = !projectId || !recordsRead.eligible
  const records = recordsRead.data ?? (projectsRead.data && noRead ? [] : undefined)
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
      onProjectChange={setChosenId}
      onRetry={() => void recordsRead.refetch()}
      projectId={projectId}
      projects={projects}
      status={recordsRead.isError ? 'error' : records ? 'success' : 'loading'}
    />
  )
}
