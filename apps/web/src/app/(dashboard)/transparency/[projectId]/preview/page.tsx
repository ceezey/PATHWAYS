import { PageHeader } from '@/components/layout/page-header'
import { PublicTrackerPreview } from '@/features/public/public-tracker-preview'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('transparencyPreview', props)
  const projectId = (await props.params)?.projectId ?? ''

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public Tracker"
        title="Public preview"
        description="Review the frozen public snapshot for this project's current revision."
      />
      <PublicTrackerPreview projectId={projectId} />
    </div>
  )
}
