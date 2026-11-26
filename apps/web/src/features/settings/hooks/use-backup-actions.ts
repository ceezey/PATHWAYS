'use client'

import {
  type RecoveryPointDownload,
  type RecoveryPointListItem,
  recoveryPointProblemMessages,
} from '@pathways/shared'
import { useRef, useState } from 'react'

import { backupsClient } from '@/lib/api/backups'
import { plural } from '@/lib/format/plural'
import {
  type BackupAction,
  backupFailureMessage,
  formatRecoveryPointTime,
  isStepUpRequired,
} from '../backup-recovery.utils'

// pointId names the row the notice is about, so the page can highlight it.
type Notice = { tone: 'success' | 'danger'; text: string; pointId: string | null }

/** The page's backup actions, one at a time; create and verify refetch the list afterwards. */
export function useBackupActions(refetch: () => unknown) {
  // A ref, not state, so a second click in the same tick is ignored.
  const busy = useRef(false)
  const [pending, setPending] = useState<{ action: BackupAction; pointId: string | null } | null>(
    null,
  )
  const [notice, setNotice] = useState<Notice | null>(null)
  const [links, setLinks] = useState<(RecoveryPointDownload & { pointId: string }) | null>(null)
  // The refusal of the open download or restore dialog, and whether it asks for an authenticator code.
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [stepUpRequired, setStepUpRequired] = useState(false)

  const run = async (
    action: BackupAction,
    pointId: string | null,
    work: () => Promise<void>,
    refresh: boolean,
  ) => {
    if (busy.current) return
    busy.current = true
    setPending({ action, pointId })
    setNotice(null)
    try {
      await work()
    } catch (caught) {
      setNotice({ tone: 'danger', text: backupFailureMessage(action, caught), pointId })
    } finally {
      busy.current = false
      setPending(null)
      if (refresh) refetch()
    }
  }

  /** True when the work succeeded; a failure keeps its message in dialogError for the dialog. */
  const inDialog = async (
    action: BackupAction,
    point: RecoveryPointListItem,
    work: () => Promise<void>,
    refresh: boolean,
  ) => {
    if (busy.current) return false
    busy.current = true
    setPending({ action, pointId: point.id })
    setNotice(null)
    setDialogError(null)
    setStepUpRequired(false)
    try {
      await work()
      return true
    } catch (caught) {
      setDialogError(backupFailureMessage(action, caught))
      setStepUpRequired(isStepUpRequired(caught))
      return false
    } finally {
      busy.current = false
      setPending(null)
      if (refresh) refetch()
    }
  }

  return {
    pending,
    notice,
    links,
    dialogError,
    stepUpRequired,
    clearDialogError: () => {
      setDialogError(null)
      setStepUpRequired(false)
    },
    restore: (point: RecoveryPointListItem, organizationCode: string) =>
      inDialog(
        'restore',
        point,
        async () => {
          const { filesRestored } = await backupsClient.restore(point.id, { organizationCode })
          const files = filesRestored > 0 ? ` ${plural(filesRestored, 'file')} copied back.` : ''
          setNotice({
            tone: 'success',
            text: `Restored to the recovery point from ${formatRecoveryPointTime(point)}. A recovery point of the data before the restore was saved first.${files}`,
            pointId: point.id,
          })
        },
        true,
      ),
    download: (point: RecoveryPointListItem, passphrase: string) =>
      inDialog(
        'download',
        point,
        async () => {
          setLinks({
            ...(await backupsClient.download(point.id, { passphrase })),
            pointId: point.id,
          })
        },
        false,
      ),
    create: () =>
      run(
        'create',
        null,
        async () => {
          const created = await backupsClient.create()
          setNotice({ tone: 'success', text: 'Recovery point saved.', pointId: created.id })
        },
        true,
      ),
    verify: (point: RecoveryPointListItem) =>
      run(
        'verify',
        point.id,
        async () => {
          const { problem } = await backupsClient.verify(point.id)
          setNotice(
            problem
              ? { tone: 'danger', text: recoveryPointProblemMessages[problem], pointId: point.id }
              : {
                  tone: 'success',
                  text: 'This recovery point can be restored.',
                  pointId: point.id,
                },
          )
        },
        true,
      ),
  }
}
