import { UsersRound } from 'lucide-react'

import { ModulePlaceholder } from '@/components/layout/module-placeholder'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

const enrollmentTone = {
  Active: 'success',
  'Pending Review': 'warning',
  Completed: 'info',
  Exited: 'neutral',
} as const

export default async function BeneficiariesPage() {
  const beneficiaries = await pathwaysClient.getBeneficiaries()

  return (
    <>
      <PageHeader
        eyebrow="Beneficiaries"
        title="Beneficiary Journey Tracking"
        description="Beneficiary directory, filters, profiles, participation history, and journey timeline views are scheduled for Phase 7."
      />
      <ModulePlaceholder
        title="Beneficiary management foundation"
        summary="This placeholder uses safe dummy records through the PathwaysClient mock service. It does not contain real or identifiable beneficiary data."
      >
        {beneficiaries.length > 0 ? (
          <div className="grid gap-3">
            {beneficiaries.map((beneficiary) => (
              <SectionCard
                key={beneficiary.id}
                title={beneficiary.code}
                description={`${beneficiary.location} - ${beneficiary.ageGroup}`}
                actions={
                  <StatusBadge tone={enrollmentTone[beneficiary.enrollmentStatus]}>
                    {beneficiary.enrollmentStatus}
                  </StatusBadge>
                }
              >
                <dl className="grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Display label</dt>
                    <dd className="mt-1 font-medium text-foreground">{beneficiary.displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Sex</dt>
                    <dd className="mt-1 font-medium text-foreground">{beneficiary.sex}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Disability status</dt>
                    <dd className="mt-1 font-medium text-foreground">
                      {beneficiary.disabilityStatus}
                    </dd>
                  </div>
                </dl>
              </SectionCard>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Beneficiary records will appear here after the mock service returns data."
            icon={UsersRound}
            title="No beneficiaries available"
          />
        )}
      </ModulePlaceholder>
    </>
  )
}
