import type { PublicProjectRecord } from '@/types/pathways'
import {
  type DemoState,
  appendAudit,
  commitDemo,
  currentAccount,
  demoTime,
  getDemoState,
  migrateDemoState,
  nextId,
  transactDemo,
  validateDemoState,
} from './store'

const checksum = (text: string) => {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1)
    value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return `fnv1a-${(value >>> 0).toString(16).padStart(8, '0')}`
}

export function createBackup() {
  return transactDemo('backup.create', undefined, undefined, (state) => {
    if (state.scenario === 'backup-storage-unavailable')
      throw new Error('Browser backup storage is unavailable. No backup was created.')
    if (state.scenario === 'backup-create-failure')
      throw new Error(
        'Backup creation failed before commit. Existing state and backups are unchanged.',
      )
    const payload = JSON.stringify({ ...state, backups: [] })
    const backup = {
      id: nextId(state, 'backup'),
      at: demoTime(state),
      name: `pathways-demo-backup-${state.revision}.json`,
      payload,
      checksum: checksum(payload),
    }
    state.backups.unshift(backup)
    return backup
  })
}

export function downloadBackup(payload: string, name: string) {
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function restoreBackup(id: string) {
  return transactDemo('backup.restore', undefined, id, (state) => {
    if (state.scenario === 'restore-failure')
      throw new Error(
        'Restore failed during validation. Current state was retained without partial changes.',
      )
    const backup = state.backups.find((row) => row.id === id)
    if (!backup) throw new Error('Select an available backup.')
    if (checksum(backup.payload) !== backup.checksum)
      throw new Error('Backup integrity check failed. Current state was retained.')
    const restored = migrateDemoState(JSON.parse(backup.payload))
    if (!validateDemoState(restored))
      throw new Error('Backup format is invalid or incompatible. Current state was retained.')
    const inventory = state.backups
    Object.assign(state, structuredClone(restored as DemoState), {
      backups: inventory,
      scenario: 'baseline',
    })
  })
}

export function importBackupFile(payload: string, name: string) {
  const candidate = migrateDemoState(JSON.parse(payload))
  if (!validateDemoState(candidate))
    throw new Error('Selected file is not a compatible PATHWAYS demo backup.')
  const next = structuredClone(getDemoState())
  const actor = currentAccount(next)
  if (!actor || actor.role !== 'System Administrator')
    throw new Error('Only System Administrator can add a recovery file.')
  const backup = {
    id: nextId(next, 'backup'),
    at: demoTime(next),
    name,
    payload,
    checksum: checksum(payload),
  }
  next.backups.unshift(backup)
  appendAudit(
    next,
    {
      action: 'backup.create',
      module: 'backup',
      entityId: backup.id,
      outcome: 'Success',
      details: 'Local recovery file validated and added.',
    },
    actor,
  )
  commitDemo(next)
  return backup
}

const completePublicContent = (record: PublicProjectRecord) =>
  Boolean(
    record.title.trim() &&
      record.tagline.trim() &&
      record.approvedSummary.trim() &&
      record.publicPresentation.headline.trim() &&
      record.publicPresentation.summaryBody.trim() &&
      record.selectedIndicators.length &&
      record.milestones.length,
  )

export function updatePublication(
  projectId: string,
  update: Partial<Pick<PublicProjectRecord, 'tagline' | 'approvedSummary'>>,
) {
  return transactDemo('public.review', projectId, projectId, (state) => {
    const publication = state.publications.find((row) => row.projectId === projectId)
    if (!publication) throw new Error('Public project draft was not found.')
    publication.draft = { ...publication.draft, ...update }
    publication.revision += 1
    publication.approvedRevision = null
  })
}
export function approvePublication(projectId: string) {
  return transactDemo('public.approve', projectId, projectId, (state) => {
    const publication = state.publications.find((row) => row.projectId === projectId)
    if (!publication) throw new Error('Public project draft was not found.')
    if (!completePublicContent(publication.draft))
      throw new Error(
        'Public content is incomplete. Add summary, indicators, milestones, and presentation text before approval.',
      )
    publication.approvedRevision = publication.revision
  })
}
export function publishPublication(projectId: string) {
  return transactDemo('public.publish', projectId, projectId, (state) => {
    const publication = state.publications.find((row) => row.projectId === projectId)
    if (!publication) throw new Error('Public project draft was not found.')
    if (!completePublicContent(publication.draft))
      throw new Error('Public content is incomplete and cannot be published.')
    if (publication.approvedRevision !== publication.revision)
      throw new Error('This revision has not been approved. Approve it before publishing.')
    publication.published = structuredClone(publication.draft)
  })
}
export function unpublishPublication(projectId: string) {
  return transactDemo('public.unpublish', projectId, projectId, (state) => {
    const publication = state.publications.find((row) => row.projectId === projectId)
    if (!publication) throw new Error('Public project record was not found.')
    publication.published = null
  })
}
