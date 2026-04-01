import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { PageHeader } from '@/components/layout/page-header'
import { PmerlPreview } from '@/features/reports/pmerl-preview'

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="Reporting and export shell"
        description="Report generation stays placeholder-only for now, but export utilities and PMERL shaping helpers are already wired into the workspace."
      />
      <ModulePlaceholder
        title="Export preview"
        summary="The JSON preview below comes from the PMERL formatter helper inside packages/imports."
      >
        <PmerlPreview />
      </ModulePlaceholder>
    </>
  )
}
