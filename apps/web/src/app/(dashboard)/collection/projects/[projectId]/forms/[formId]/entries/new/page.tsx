import { DirectFormEntryWorkspace } from '@/features/collection/direct-form-entry-workspace'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('formEntry', props)
  const params = await props.params
  const submissionId = (await props.searchParams)?.submissionId
  return (
    <DirectFormEntryWorkspace
      formId={params?.formId ?? ''}
      initialSubmissionId={typeof submissionId === 'string' ? submissionId : undefined}
      projectId={params?.projectId ?? ''}
    />
  )
}
