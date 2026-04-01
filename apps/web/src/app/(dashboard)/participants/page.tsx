import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { PageHeader } from '@/components/layout/page-header'
import { ParticipantTablePreview } from '@/features/participants/participant-table-preview'

export default function ParticipantsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Participant registry"
        description="TanStack Table and placeholder registry routes are in place so the real participant module can attach to a stable shell later."
      />
      <ModulePlaceholder
        title="Registry preview"
        summary="These records are static seed-like examples only. Final registry logic, filters, and profile workflows intentionally remain out of scope for this setup pass."
      >
        <ParticipantTablePreview />
      </ModulePlaceholder>
    </>
  )
}
