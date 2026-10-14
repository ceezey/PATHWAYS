import { useEffect } from 'react'
import { toast } from 'sonner'

import { formsClient } from '@/lib/api/forms'
import { importsClient } from '@/lib/api/imports'
import { projectsClient } from '@/lib/api/projects'

import type { ImportState } from './use-import-state'

export function useImportLoading(state: ImportState) {
  const {
    latest,
    loadAttempt,
    projectId,
    scope,
    setBatch,
    setBatches,
    setFormId,
    setForms,
    setFormsState,
    setLoadState,
    setMapping,
    setProjectId,
    setProjects,
    setRows,
    setRules,
  } = state
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt restarts the project load on Retry.
  useEffect(() => {
    let mounted = true
    projectsClient
      .getProjects()
      .then((value) => {
        if (!mounted || !scope.isCurrent()) return
        setProjects(value)
        // Only default when nothing is chosen yet; a refetch (or a remount whose key was
        // recomputed from the same access grants) must not discard the current pick.
        setProjectId((current) => current || value[0]?.id || '')
        setLoadState('ready')
      })
      .catch(() => mounted && scope.isCurrent() && setLoadState('error'))
    return () => {
      mounted = false
    }
  }, [scope.isCurrent, loadAttempt])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the setters of the state hook are stable
  useEffect(() => {
    if (!projectId) return
    let mounted = true
    setForms([])
    setFormsState('loading')
    setBatches([])
    setBatch(null)
    setRows([])
    setMapping({})
    setRules({})
    Promise.all([formsClient.getDigitalForms(projectId), importsClient.getImportBatches(projectId)])
      .then(([formRecords, batchRecords]) => {
        if (!mounted || !scope.isCurrent() || latest.current.projectId !== projectId) return
        const published = formRecords.filter((item) => item.status === 'PUBLISHED')
        setForms(published)
        setFormsState('ready')
        setFormId((current) =>
          published.some((item) => item.id === current) ? current : (published[0]?.id ?? ''),
        )
        setBatches(batchRecords)
        setBatch(null)
        setRows([])
      })
      .catch(() => {
        if (mounted && scope.isCurrent() && latest.current.projectId === projectId) {
          setFormsState('error')
          toast.error('Import workspace data could not be loaded.')
        }
      })
    return () => {
      mounted = false
    }
  }, [projectId, scope.isCurrent])
}
