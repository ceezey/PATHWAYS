import { PageHeader } from '@/components/layout/page-header'
import { LoadingSkeleton, SectionCard, StatusBadge } from '@/components/pathways'

export default function UserManagementLoading() {
  return (
    <div aria-busy="true" aria-label="Loading user management" className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        description="Loading prototype users, role assignments, and account states."
        actions={<StatusBadge tone="info">Prototype only</StatusBadge>}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-24 animate-pulse rounded-lg border border-border bg-card" key={item} />
        ))}
      </section>
      <SectionCard title="User accounts" description="Loading the sample account directory.">
        <LoadingSkeleton lines={6} />
      </SectionCard>
    </div>
  )
}
