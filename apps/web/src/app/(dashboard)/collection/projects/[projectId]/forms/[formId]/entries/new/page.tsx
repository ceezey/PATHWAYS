import { DirectFormEntryWorkspace } from '@/features/collection/direct-form-entry-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('formEntry', props)
  const params = await props.params
  return (
    <DirectFormEntryWorkspace formId={params?.formId ?? ''} projectId={params?.projectId ?? ''} />
  )
}
