import { useEffect, useState } from 'react'

import { projectsClient } from '@/lib/api/projects'
import { usersClient } from '@/lib/api/users'
import type { ProjectSummary, UserRecord } from '@/types/pathways'

export const useUserDirectory = (initialUsers: UserRecord[], initialProjects: ProjectSummary[]) => {
  const [users, setUsers] = useState<UserRecord[]>(initialUsers)
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  useEffect(() => {
    void loadAttempt
    let active = true
    setLoadState('loading')
    void Promise.all([usersClient.getUsers(), projectsClient.getProjects()])
      .then(([nextUsers, nextProjects]) => {
        if (!active) return
        setUsers(nextUsers)
        setProjects(nextProjects)
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [loadAttempt])
  return { users, setUsers, projects, loadState, setLoadAttempt }
}
