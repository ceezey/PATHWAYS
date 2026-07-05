import { ClipboardList } from 'lucide-react'

import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'

const collectionModes = [
  {
    title: 'Build from scratch',
    description: 'Create a metadata-aware form definition for a project workflow.',
    phase: 'Phase 6',
  },
  {
    title: 'Import an existing file',
    description: 'Stage a CSV or XLSX file for mapping, validation, and review.',
    phase: 'Phase 6',
  },
  {
    title: 'Import then extend',
    description: 'Start from detected columns and add metadata fields before saving.',
    phase: 'Phase 6',
  },
]

export default function CollectionPage() {
  return (
    <>
      <PageHeader
        eyebrow="Collection"
        title="Metadata-Driven Data Integration"
        description="Collection modes, form builder, file preview, metadata mapping, and validation summaries are scheduled for Phase 6."
      />
      <ModulePlaceholder
        title="Collection module foundation"
        summary="The route and shell are ready. The interactive builder and import workflow will be added after the shared foundation is stable."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {collectionModes.map((mode) => (
            <SectionCard
              key={mode.title}
              title={mode.title}
              description={mode.description}
              actions={<StatusBadge tone="info">{mode.phase}</StatusBadge>}
            >
              <EmptyState
                className="min-h-[120px]"
                description="GUI implementation scheduled in a later phase."
                icon={ClipboardList}
                title="Prototype placeholder"
              />
            </SectionCard>
          ))}
        </div>
      </ModulePlaceholder>
    </>
  )
}
