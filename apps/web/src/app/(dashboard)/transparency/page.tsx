import { PublicationQueueWorkspace } from '@/features/public/publication-queue-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('transparencyQueue', props)
  return <PublicationQueueWorkspace />
}
