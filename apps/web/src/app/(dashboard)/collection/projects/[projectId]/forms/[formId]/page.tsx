import { CollectionWorkspace } from '@/features/collection/collection-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('form', props)
  const params = await props.params
  return (
    <CollectionWorkspace
      initialFormId={params?.formId}
      initialMode="scratch"
      initialProjectId={params?.projectId}
      initialView="builder"
    />
  )
}
