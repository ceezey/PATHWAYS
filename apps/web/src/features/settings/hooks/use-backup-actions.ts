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
} from '../backup-recovery.utils'

type Notice = { tone: 'success' | 'danger'; text: string }

/** The page's backup actions, one at a time; create and verify refetch the list afterwards. */
export function useBackupActions(refetch: () => unknown) {
  // A ref, not state, so a second click in the same tick is ignored.
  const busy = useRef(false)
  const [pending, setPending] = useState<{ action: BackupAction; pointId: string | null } | null>(
    null,
  )
  const [notice, setNotice] = useState<Notice | null>(null)
  const [links, setLinks] = useState<(RecoveryPointDownload & { pointId: string }) | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

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
      setNotice({ tone: 'danger', text: backupFailureMessage(action, caught) })
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
    restoreError,
    clearRestoreError: () => setRestoreError(null),
    /** True when the restore succeeded; a failure keeps its message in restoreError for the dialog. */
    restore: async (point: RecoveryPointListItem, organizationCode: string) => {
      if (busy.current) return false
      busy.current = true
      setPending({ action: 'restore', pointId: point.id })
      setNotice(null)
      setRestoreError(null)
      try {
        const { filesRestored } = await backupsClient.restore(point.id, { organizationCode })
        const files = filesRestored > 0 ? ` ${plural(filesRestored, 'file')} copied back.` : ''
        setNotice({
          tone: 'success',
          text: `Restored to the recovery point from ${formatRecoveryPointTime(point)}. A recovery point of the data before the restore was saved first.${files}`,
        })
        return true
      } catch (caught) {
        setRestoreError(backupFailureMessage('restore', caught))
        return false
      } finally {
        busy.current = false
        setPending(null)
        refetch()
      }
    },
    create: () =>
      run(
        'create',
        null,
        async () => {
          await backupsClient.create()
          setNotice({ tone: 'success', text: 'Recovery point saved.' })
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
              ? { tone: 'danger', text: recoveryPointProblemMessages[problem] }
              : { tone: 'success', text: 'This recovery point can be restored.' },
          )
        },
        true,
      ),
    download: (point: RecoveryPointListItem) =>
      run(
        'download',
        point.id,
        async () => {
          setLinks({ ...(await backupsClient.download(point.id)), pointId: point.id })
        },
        false,
      ),
  }
}
