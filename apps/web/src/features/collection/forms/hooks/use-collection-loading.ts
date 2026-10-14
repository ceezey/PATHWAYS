import { useEffect } from 'react'

import { activitiesClient } from '@/lib/api/activities'
import { formsClient } from '@/lib/api/forms'
import { indicatorsClient } from '@/lib/api/indicators'
import { projectsClient } from '@/lib/api/projects'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import type { principalHasAtomicPermission } from '@/lib/rbac/policy'

import type { CollectionGuard } from './use-collection-guard'
import type { CollectionState } from './use-collection-state'

export function useCollectionLoading(state: CollectionState, guard: CollectionGuard) {
  const {
    current,
    isCurrentOwner,
    profile,
    projectId,
    reloadKey,
    role,
    setActivities,
    setForms,
    setFormsLoaded,
    setIndicators,
    setLoadError,
    setProjectId,
    setProjects,
    setProjectsLoaded,
    view,
  } = state
  const { canReadActivities, canReadForms, canReadIndicators, eligible } = guard
  // Keyed on primitives, not the profile object: a background `me` refetch hands back a new
  // object for the same identity and must not cancel an in-flight load. A response dropped
  // because the sensitive-draft generation moved (or the request lost ownership mid-flight)
  // is retried against the new generation instead of leaving the list empty.
  const hasProfile = Boolean(profile)
  const profileUserId = profile?.userId
  const profileOrganizationId = profile?.organizationId
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity primitives stand in for the profile object
  useEffect(() => {
    if (!role || !hasProfile || !eligible('projects.read', '')) return
    let active = true
    const maxAttempts = 3
    const load = async (attempt: number): Promise<void> => {
      const generation = sensitiveDraftGeneration()
      const retry = () => active && isCurrentOwner() && attempt < maxAttempts
      try {
        const records = await projectsClient.getProjectsForRole(role)
        if (!active || !isCurrentOwner()) return
        if (generation !== sensitiveDraftGeneration()) {
          if (retry()) return load(attempt + 1)
          // Retries exhausted: never render the dropped rows, but never stay on "Loading".
          setProjectsLoaded(true)
          setLoadError('Projects could not be loaded.')
          return
        }
        setProjects(records)
        setProjectId((current) => current || records[0]?.id || '')
        setProjectsLoaded(true)
      } catch (error: unknown) {
        if (!active || !isCurrentOwner()) return
        if (generation !== sensitiveDraftGeneration() && retry()) return load(attempt + 1)
        setProjectsLoaded(true)
        setLoadError(error instanceof Error ? error.message : 'Projects could not be loaded.')
      }
    }
    void load(1)
    return () => {
      active = false
    }
  }, [hasProfile, profileUserId, profileOrganizationId, role, eligible, isCurrentOwner, reloadKey])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey re-runs the load when Retry is pressed
  useEffect(() => {
    if (!projectId) {
      setForms([])
      setActivities([])
      setIndicators([])
      return
    }
    setFormsLoaded(false)
    setLoadError('')
    let active = true
    const generation = sensitiveDraftGeneration()
    const requests: Promise<void>[] = []
    const load = async <T>(
      request: Promise<T>,
      apply: (value: T) => void,
      label: string,
      permission: Parameters<typeof principalHasAtomicPermission>[1],
    ) => {
      try {
        const value = await request
        if (
          active &&
          generation === sensitiveDraftGeneration() &&
          current.current.projectId === projectId &&
          eligible(permission, projectId)
        )
          apply(value)
      } catch (error) {
        if (
          active &&
          generation === sensitiveDraftGeneration() &&
          current.current.projectId === projectId &&
          eligible(permission, projectId)
        ) {
          setLoadError(error instanceof Error ? error.message : `${label} could not be loaded.`)
        }
      }
    }
    if (canReadForms && eligible('forms.read', projectId)) {
      requests.push(
        load(formsClient.getDigitalForms(projectId), setForms, 'Forms', 'forms.read').then(() => {
          if (active) setFormsLoaded(true)
        }),
      )
    } else {
      setForms([])
      setFormsLoaded(true)
    }
    if (view === 'builder' && canReadActivities && eligible('activities.read', projectId)) {
      requests.push(
        load(
          activitiesClient.getActivities(projectId),
          setActivities,
          'Activities',
          'activities.read',
        ),
      )
    } else {
      setActivities([])
    }
    if (view === 'builder' && canReadIndicators && eligible('monitoring.read', projectId)) {
      requests.push(
        load(
          indicatorsClient.getIndicators(projectId),
          setIndicators,
          'Indicators',
          'monitoring.read',
        ),
      )
    } else {
      setIndicators([])
    }
    void Promise.all(requests)
    return () => {
      active = false
    }
  }, [canReadActivities, canReadForms, canReadIndicators, projectId, view, eligible, reloadKey])
}
