'use client'

import { Pencil } from 'lucide-react'
import Link from 'next/link'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

import { enrollmentTone, formatDate, projectTitle } from '../../beneficiaries.utils'
import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'
import { SummaryRow } from './summary-row'

export const ProfileSummaryDialog = ({
  detail,
}: {
  detail: Pick<
    BeneficiaryDetailState,
    | 'profileOpen'
    | 'setProfileOpen'
    | 'canEditBeneficiary'
    | 'beneficiary'
    | 'projectId'
    | 'projects'
    | 'enrollmentStatus'
  >
}) => {
  const {
    profileOpen,
    setProfileOpen,
    canEditBeneficiary,
    beneficiary,
    projectId,
    projects,
    enrollmentStatus,
  } = detail
  return (
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
      <DialogShell
        title="Profile summary"
        description="Coded profile details for this beneficiary."
        actions={
          canEditBeneficiary ? (
            <Button asChild size="icon" title="Edit beneficiary profile" variant="outline">
              <Link
                aria-label="Edit beneficiary profile"
                href={`/beneficiaries/${beneficiary.id}/edit?projectId=${encodeURIComponent(projectId)}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 text-sm">
            <SummaryRow label="Beneficiary code" value={beneficiary.code} />
            <SummaryRow
              label="Safe profile name"
              value={[beneficiary.firstName, beneficiary.middleName, beneficiary.lastName]
                .filter(Boolean)
                .join(' ')}
            />
            <SummaryRow label="Location" value={beneficiary.location} />
            <SummaryRow
              label="Consent"
              value={beneficiary.consentToStoreData ? 'Confirmed' : 'Pending'}
            />
            <SummaryRow
              label="Guardian consent"
              value={
                beneficiary.isMinor
                  ? beneficiary.guardianConsent
                    ? 'Confirmed'
                    : 'Pending'
                  : 'Not applicable'
              }
            />
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle p-4">
            <p className="text-xs uppercase text-muted-foreground">Project enrollment</p>
            {beneficiary.enrollments.map((enrollment) => (
              <div key={enrollment.id} className="mt-3 space-y-2">
                <p className="font-medium text-foreground">
                  {projectTitle(enrollment.projectId, projects)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={enrollmentTone(enrollmentStatus)}>
                    {enrollmentStatus}
                  </StatusBadge>
                  <StatusBadge tone="neutral">{enrollment.followUpStatus}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enrolled {formatDate(enrollment.enrolledAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </DialogShell>
    </Dialog>
  )
}
