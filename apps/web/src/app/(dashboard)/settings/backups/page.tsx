import { notFound } from 'next/navigation'

import { BACKUP_RECOVERY_UI_ENABLED } from '@/constants/feature-flags'
import { BackupRecoveryWorkspace } from '@/features/settings/backup-recovery-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  if (!BACKUP_RECOVERY_UI_ENABLED) notFound()
  await requireServerPage('backups', props)
  return <BackupRecoveryWorkspace />
}
