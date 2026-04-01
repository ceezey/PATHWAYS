import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { PageHeader } from '@/components/layout/page-header'
import { ImportSummaryPreview } from '@/features/imports/import-summary-preview'

export default function ImportsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Imports"
        title="Bulk import staging"
        description="CSV/XLSX parsing utilities and metadata header comparison helpers are scaffolded without shipping final business rules yet."
      />
      <ModulePlaceholder
        title="Import package preview"
        summary="packages/imports contains parser, validator, mapper, and export placeholders ready for the metadata-driven rules you add later."
      >
        <ImportSummaryPreview />
      </ModulePlaceholder>
    </>
  )
}
