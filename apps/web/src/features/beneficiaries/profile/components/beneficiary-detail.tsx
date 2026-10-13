'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { BeneficiaryMediaProof } from '../../media/components/beneficiary-media-proof'

import { type BeneficiaryDetailProps, useBeneficiaryDetail } from '../hooks/use-beneficiary-detail'
import { AssessmentDialog } from './assessment-dialog'
import { DetailHeader } from './detail-header'
import { EnrollmentStatusDialog } from './enrollment-status-dialog'
import { JourneyNoteDialog } from './journey-note-dialog'
import { JourneyTab } from './journey-tab'
import { ParticipationDialog } from './participation-dialog'
import { ProfileSummaryDialog } from './profile-summary-dialog'
import { RecordList } from './record-list'

export const BeneficiaryDetail = (props: BeneficiaryDetailProps) => {
  const detail = useBeneficiaryDetail(props)
  const {
    beneficiary,
    projectId,
    activities,
    stages,
    participation,
    canViewMedia,
    canUploadMedia,
  } = detail

  return (
    <div className="space-y-6">
      <DetailHeader detail={detail} />

      <ProfileSummaryDialog detail={detail} />

      <div className="min-w-0 space-y-6">
        {beneficiary.sex === 'Prefer not to say' ||
        beneficiary.disabilityStatus === 'Not specified' ? (
          <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-warning">
            SADDD completeness warning: one or more sex, age, or disability dimensions are not
            disclosed for this profile.
          </div>
        ) : null}
        <section aria-labelledby="beneficiary-information-title" className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Beneficiary record
            </p>
            <h2
              className="mt-1 text-xl font-semibold text-foreground"
              id="beneficiary-information-title"
            >
              Beneficiary Information
            </h2>
          </div>

          <Tabs className="min-w-0" defaultValue="journey">
            <TabsList className="flex w-full overflow-x-auto" aria-label="Beneficiary information">
              <TabsTrigger value="journey">Journey tracking</TabsTrigger>
              {canViewMedia ? <TabsTrigger value="media">Media proof</TabsTrigger> : null}
              <TabsTrigger value="participation">Participation history</TabsTrigger>
            </TabsList>

            <JourneyTab detail={detail} />

            {canViewMedia ? (
              <TabsContent value="media">
                <BeneficiaryMediaProof
                  beneficiaryId={beneficiary.id}
                  canManage={canUploadMedia}
                  projectId={projectId}
                />
              </TabsContent>
            ) : null}

            <TabsContent value="participation">
              <RecordList
                activities={activities}
                participation={participation}
                stages={stages}
                title="Participation history"
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <AssessmentDialog detail={detail} />
      <ParticipationDialog detail={detail} />
      <EnrollmentStatusDialog detail={detail} />
      <JourneyNoteDialog detail={detail} />
    </div>
  )
}
