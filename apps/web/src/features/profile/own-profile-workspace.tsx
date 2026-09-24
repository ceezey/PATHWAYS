'use client'

import { Info } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/pathways/section-card'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'

export const OwnProfileWorkspace = () => {
  const { email } = useSession()
  const { profile } = useCurrentRole()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account settings"
        title="My Profile"
        description="Review the account details available to this workspace."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <SectionCard
          title="Profile information"
          description="Profile editing is unavailable until a verified self-service endpoint is configured."
        >
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="font-medium text-foreground">Name</dt>
              <dd className="mt-1 text-muted-foreground">{profile?.fullName || 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Email address</dt>
              <dd className="mt-1 text-muted-foreground">{email || 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Contact number</dt>
              <dd className="mt-1 text-muted-foreground">Not available from the current API</dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard
          title="Change password"
          description="Password changes are not available from this profile page."
        >
          <output className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary-subtle p-3 text-sm leading-6 text-light-blue-foreground">
            <Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Use the approved account-recovery flow when a password change is required.</p>
          </output>
        </SectionCard>
      </div>
    </div>
  )
}
