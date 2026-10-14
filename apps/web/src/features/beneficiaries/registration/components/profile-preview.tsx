'use client'

import type { ProjectSummary } from '@/types/pathways'
import type { BeneficiaryDraft } from '../registration.utils'
import { PreviewRow } from './preview-row'

export const ProfilePreview = ({
  draft,
  projects,
  supportsCode,
}: {
  draft: BeneficiaryDraft
  projects: ProjectSummary[]
  supportsCode: (code: string) => boolean
}) => (
  <aside className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <h2 className="text-lg font-semibold text-foreground">Profile preview</h2>
    <div className="space-y-3 text-sm">
      <PreviewRow label="Code" value={draft.code || 'Pending'} />
      <PreviewRow
        label="Name"
        value={[
          supportsCode('first_name') ? draft.firstName : '',
          supportsCode('middle_name') ? draft.middleName : '',
          supportsCode('last_name') ? draft.lastName : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      <PreviewRow
        label="Project"
        value={projects.find((item) => item.id === draft.projectId)?.title}
      />
      <PreviewRow
        label="Location"
        value={[
          supportsCode('location_barangay') ? draft.barangay : '',
          supportsCode('location_city_municipality') ? draft.city : '',
          supportsCode('location_province') ? draft.province : '',
        ]
          .filter(Boolean)
          .join(', ')}
      />
      <PreviewRow
        label="Consent"
        value={draft.consentToParticipate && draft.consentToStoreData ? 'Confirmed' : 'Pending'}
      />
    </div>
  </aside>
)
