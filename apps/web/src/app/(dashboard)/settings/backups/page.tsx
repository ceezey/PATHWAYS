import { BackupRecoveryWorkspace } from '@/features/settings/backup-recovery-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('backups', props)
  return <BackupRecoveryWorkspace />
}
