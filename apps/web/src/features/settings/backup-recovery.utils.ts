import { PathwaysClientError } from '@/lib/api/core/request'
import type { StatusTone } from '@/lib/format/tone'
import type {
  RecoveryPointKind,
  RecoveryPointListItem,
  RecoveryPointStatus,
} from '@pathways/shared'

export const recoveryPointKindLabels: Record<RecoveryPointKind, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automatic (daily)',
  PRE_RESTORE: 'Before restore',
}

export const recoveryPointStatusView: Record<
  RecoveryPointStatus,
  { label: string; tone: StatusTone }
> = {
  READY: { label: 'Ready', tone: 'success' },
  CREATING: { label: 'Creating', tone: 'info' },
  FAILED: { label: 'Failed', tone: 'danger' },
  UNAVAILABLE: { label: 'Unavailable', tone: 'warning' },
  INCOMPATIBLE: { label: 'Incompatible', tone: 'warning' },
}

export const canRestorePoint = (point: RecoveryPointListItem) => point.status === 'READY'
// Unavailable points can be checked again and downloaded; the server re-checks every restore.
export const canCheckPoint = (point: RecoveryPointListItem) =>
  point.status === 'READY' || point.status === 'INCOMPATIBLE' || point.status === 'UNAVAILABLE'

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})
export const formatRecoveryPointTime = (point: RecoveryPointListItem) =>
  timeFormatter.format(new Date(point.capturedAt ?? point.startedAt))

export const recoveryPointCreator = (point: RecoveryPointListItem) =>
  point.createdBy?.name ?? 'System'

export type BackupAction = 'create' | 'verify' | 'download' | 'restore'

const GENERIC_SERVER_MESSAGE = 'The requested operation could not be completed.'
const SERVER_TEXT_STATUSES = new Set([400, 403, 409, 422, 503])

export function backupFailureMessage(action: BackupAction, caught: unknown): string {
  const status = caught instanceof PathwaysClientError ? caught.status : undefined
  if (
    caught instanceof PathwaysClientError &&
    status !== undefined &&
    SERVER_TEXT_STATUSES.has(status) &&
    caught.message !== GENERIC_SERVER_MESSAGE
  )
    return caught.message
  if (status === 404) return 'This recovery point no longer exists. Refresh the list.'
  if (action === 'create')
    return 'The backup could not be created. The failure is recorded in the audit log.'
  if (action === 'restore')
    return status === 500
      ? 'The restore failed and your data was not changed. The failure is recorded in the audit log.'
      : 'The restore result could not be confirmed. Refresh the list and check the audit log before trying again.'
  if (action === 'verify') return 'The recovery point could not be checked.'
  return 'The download links could not be made.'
}
