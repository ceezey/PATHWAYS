import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard } from '@/components/pathways'

const unavailable =
  'Backup and recovery are unavailable until a server-backed service is configured.'

export const BackupRecoveryWorkspace = () => (
  <div className="space-y-6">
    <PageHeader
      eyebrow="Administration / Continuity"
      title="Backup & Recovery"
      description="Create, download, validate, and restore PATHWAYS recovery points."
    />
    <SectionCard
      title="Recovery points"
      description="Recovery points are unavailable without a server-backed backup service."
    >
      <EmptyState title="No recovery point yet" description={unavailable} />
    </SectionCard>
  </div>
)
