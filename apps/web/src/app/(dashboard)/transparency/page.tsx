import { PublicationQueueWorkspace } from '@/features/public'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'
import { publicView } from '@pathways/shared'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('transparencyQueue', props)
  const { projectId, addView } = (await props.searchParams) ?? {}
  return (
    <PublicationQueueWorkspace
      initialProjectId={typeof projectId === 'string' ? projectId : undefined}
      initialAddView={publicView.safeParse(addView).data}
    />
  )
}
