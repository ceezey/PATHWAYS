import { ManualDataEntryWorkspace } from '@/features/collection/manual-data-entry-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('manualEntry', props)
  return <ManualDataEntryWorkspace />
}
