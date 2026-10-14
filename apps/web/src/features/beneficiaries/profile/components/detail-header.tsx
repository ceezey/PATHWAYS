'use client'

import { ArrowLeft, UserCheck } from 'lucide-react'
import Link from 'next/link'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'

import { enrollmentTone, formatDate, projectTitle } from '../../beneficiaries.utils'
import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'

export const DetailHeader = ({
  detail,
}: {
  detail: Pick<
    BeneficiaryDetailState,
    | 'initials'
    | 'setProfileOpen'
    | 'beneficiary'
    | 'enrollmentStatus'
    | 'projectId'
    | 'projects'
    | 'headerEnrollment'
    | 'directoryHref'
    | 'canTransitionJourney'
    | 'openJourneyTransition'
  >
}) => {
  const {
    initials,
    setProfileOpen,
    beneficiary,
    enrollmentStatus,
    projectId,
    projects,
    headerEnrollment,
    directoryHref,
    canTransitionJourney,
    openJourneyTransition,
  } = detail
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <button
          aria-label="Open profile summary"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => setProfileOpen(true)}
          type="button"
        >
          {initials}
        </button>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <h1 className="font-semibold text-foreground">{beneficiary.displayName}</h1>
            <p className="text-sm text-muted-foreground">{beneficiary.code}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">{beneficiary.sex}</StatusBadge>
            <StatusBadge tone="neutral">
              {typeof beneficiary.age === 'number'
                ? `${beneficiary.age} yrs`
                : beneficiary.ageGroup}
            </StatusBadge>
            <StatusBadge tone="neutral">{beneficiary.disabilityStatus}</StatusBadge>
            <StatusBadge tone={enrollmentTone(enrollmentStatus)}>{enrollmentStatus}</StatusBadge>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 lg:justify-end">
        <div className="lg:text-right">
          <Link
            className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`/projects/${encodeURIComponent(projectId)}`}
          >
            {projectTitle(projectId, projects)}
          </Link>
          {headerEnrollment ? (
            <p className="text-sm text-muted-foreground">
              Enrolled {formatDate(headerEnrollment.enrolledAt)}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button asChild size="icon" title="Back to Beneficiaries" variant="outline">
            <Link aria-label="Back to Beneficiaries" href={directoryHref}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          {canTransitionJourney ? (
            <Button
              aria-label="Update enrollment status"
              disabled={enrollmentStatus !== 'Active'}
              onClick={openJourneyTransition}
              size="icon"
              title={
                enrollmentStatus === 'Active'
                  ? 'Update enrollment status'
                  : 'Enrollment status changes require an active enrollment.'
              }
              type="button"
              variant="outline"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
