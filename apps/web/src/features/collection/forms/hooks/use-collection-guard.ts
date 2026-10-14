import { useCallback } from 'react'

import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { getVerifiedRouteAccess, principalHasAtomicPermission } from '@/lib/rbac/policy'

import type { CollectionState } from './use-collection-state'

export function useCollectionGuard(state: CollectionState) {
  const {
    current,
    editingFormId,
    forms,
    hydratedFormId,
    intent,
    isCurrentOwner,
    lastSelectedFileRef,
    mounted,
    mutation,
    profile,
    projectId,
    projects,
    setOperationPending,
  } = state
  const canReadForms = principalHasAtomicPermission(profile, 'forms.read')
  const canManageForms = principalHasAtomicPermission(profile, 'forms.manage')
  const canPublishForms = principalHasAtomicPermission(profile, 'forms.publish')
  const canGenerateForms = principalHasAtomicPermission(profile, 'forms.generate')
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')
  const canOpenForms = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/forms').allowed,
  )
  const canOpenImport = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/import').allowed,
  )
  const canUseExtend = Boolean(
    profile && getVerifiedRouteAccess(profile, '/collection/import?mode=extend').allowed,
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: the refs of the state hook are stable
  const eligible = useCallback(
    (
      permission: Parameters<typeof principalHasAtomicPermission>[1],
      wantedProject = current.current.projectId,
    ) => {
      const principal = current.current.profile
      return Boolean(
        isCurrentOwner() &&
          mounted.current &&
          principalHasAtomicPermission(principal, permission) &&
          (!wantedProject ||
            principal?.assignedProjectIds.includes(wantedProject) ||
            principal?.roles[0] === 'SYSTEM_ADMINISTRATOR' ||
            principal?.roles[0] === 'PROGRAM_MANAGER'),
      )
    },
    [isCurrentOwner],
  )
  const beginOperation = (permission: Parameters<typeof principalHasAtomicPermission>[1]) => {
    if (
      mutation.current ||
      !eligible(permission) ||
      !projects.some((project) => project.id === projectId)
    )
      return null
    const snapshot = current.current
    const selectedFile = lastSelectedFileRef.current
    const actor = profile?.userId
    const organization = profile?.organizationId
    const originalIntent = intent.current
    const generation = sensitiveDraftGeneration()
    const marker = {}
    mutation.current = marker
    setOperationPending(true)
    const valid = (nextPermission = permission) => {
      const now = current.current
      return (
        mutation.current === marker &&
        originalIntent === intent.current &&
        generation === sensitiveDraftGeneration() &&
        lastSelectedFileRef.current === selectedFile &&
        eligible(nextPermission) &&
        actor === now.profile?.userId &&
        organization === now.profile?.organizationId &&
        snapshot.projectId === now.projectId &&
        snapshot.editingFormId === now.editingFormId &&
        snapshot.editingBaseUpdatedAt === now.editingBaseUpdatedAt &&
        snapshot.fields === now.fields &&
        snapshot.mappingRows === now.mappingRows &&
        snapshot.parsedImport === now.parsedImport &&
        snapshot.mode === now.mode &&
        snapshot.view === now.view &&
        snapshot.formTitle === now.formTitle &&
        snapshot.formType === now.formType &&
        snapshot.formCode === now.formCode &&
        snapshot.formDescription === now.formDescription &&
        snapshot.journeyStage === now.journeyStage &&
        snapshot.linkedActivityId === now.linkedActivityId &&
        snapshot.indicatorIds === now.indicatorIds &&
        snapshot.duplicateDecision === now.duplicateDecision &&
        snapshot.forms.find((form) => form.id === snapshot.editingFormId)?.updatedAt ===
          now.forms.find((form) => form.id === now.editingFormId)?.updatedAt
      )
    }
    const finish = () => {
      if (mutation.current === marker) {
        mutation.current = null
        if (mounted.current && isCurrentOwner()) setOperationPending(false)
      }
    }
    return { valid, finish }
  }
  const editingReady =
    !editingFormId ||
    (hydratedFormId === editingFormId &&
      forms.some((form) => form.id === editingFormId && form.projectId === projectId))
  return {
    beginOperation,
    canGenerateForms,
    canManageForms,
    canOpenForms,
    canOpenImport,
    canPublishForms,
    canReadActivities,
    canReadForms,
    canReadIndicators,
    canUseExtend,
    editingReady,
    eligible,
  }
}

export type CollectionGuard = ReturnType<typeof useCollectionGuard>
