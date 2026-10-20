'use client'

import { ClipboardCheck, FileText, MessageSquarePlus } from 'lucide-react'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { TabsContent } from '@/components/ui/tabs'

import { JourneyTrack } from '@/features/beneficiaries/journey/components/journey-track'

import { stageTypeTone } from '../../beneficiaries.utils'
import type { BeneficiaryDetailState } from '../hooks/use-beneficiary-detail'
import { JourneyNoteList } from './journey-note-list'
import { StageActivityList } from './stage-activity-list'

export const JourneyTab = ({
  detail,
}: {
  detail: Pick<
    BeneficiaryDetailState,
    | 'progress'
    | 'currentStage'
    | 'stageDisplayCode'
    | 'setSelectedStage'
    | 'selectedStage'
    | 'stages'
    | 'stageState'
    | 'canRecordParticipation'
    | 'selectedStageParticipationActivities'
    | 'openParticipationForSelectedStage'
    | 'canViewAssessmentDetail'
    | 'assessmentButtonDisabled'
    | 'setAssessmentOpen'
    | 'assessmentButtonTitle'
    | 'canCorrectJourney'
    | 'correctableNote'
    | 'openNoteForSelectedStage'
    | 'selectedStageActivities'
    | 'participation'
    | 'selectedStageNotes'
    | 'latestEnrollment'
    | 'unlinkedNotes'
  >
}) => {
  const {
    progress,
    currentStage,
    stageDisplayCode,
    setSelectedStage,
    selectedStage,
    stages,
    stageState,
    canRecordParticipation,
    selectedStageParticipationActivities,
    openParticipationForSelectedStage,
    canViewAssessmentDetail,
    assessmentButtonDisabled,
    setAssessmentOpen,
    assessmentButtonTitle,
    canCorrectJourney,
    correctableNote,
    openNoteForSelectedStage,
    selectedStageActivities,
    participation,
    selectedStageNotes,
    latestEnrollment,
    unlinkedNotes,
  } = detail
  return (
    <TabsContent value="journey">
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border bg-surface-subtle p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Journey tracker</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a journey stage to show its details and actions below the tracker.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge tone="success">{progress}% progressed</StatusBadge>
            <StatusBadge tone="neutral">
              {currentStage ? stageDisplayCode(currentStage) : 'No stage'} ·{' '}
              {currentStage?.name ?? 'Unmapped'}
            </StatusBadge>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <JourneyTrack
            onSelect={(id) =>
              setSelectedStage(
                selectedStage?.id === id ? null : (stages.find((stage) => stage.id === id) ?? null),
              )
            }
            selectedId={selectedStage?.id}
            stages={stages}
            stageState={stageState}
          />
        </div>

        {selectedStage ? (
          <div
            className="space-y-5 border-t border-border bg-card p-4 sm:p-5"
            id={`journey-stage-detail-${selectedStage.id}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-foreground">
                    {stageDisplayCode(selectedStage)} · {selectedStage.name}
                  </h4>
                  <StatusBadge tone={stageTypeTone(selectedStage.type)}>
                    {selectedStage.type}
                  </StatusBadge>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {selectedStage.description}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                {canRecordParticipation ? (
                  <Button
                    aria-label="Record participation"
                    disabled={selectedStageParticipationActivities.length === 0}
                    onClick={openParticipationForSelectedStage}
                    size="icon"
                    title="Record participation through the published activity-monitoring form"
                    type="button"
                  >
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
                {canViewAssessmentDetail ? (
                  <Button
                    aria-label="View assessment"
                    disabled={assessmentButtonDisabled}
                    onClick={() => setAssessmentOpen(true)}
                    size="icon"
                    title={assessmentButtonTitle}
                    type="button"
                    variant="outline"
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
                {canCorrectJourney ? (
                  <Button
                    aria-label="Add note"
                    disabled={!correctableNote}
                    onClick={openNoteForSelectedStage}
                    size="icon"
                    title={
                      correctableNote
                        ? 'Add a provenance-tracked note to the most recent journey record'
                        : 'A recorded journey event is required before a note can be added.'
                    }
                    type="button"
                    variant="outline"
                  >
                    <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <StageActivityList
                activities={selectedStageActivities}
                participation={participation}
              />
              <JourneyNoteList notes={selectedStageNotes} title="Journey notes" />
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-5">
        <h3 className="text-lg font-semibold text-foreground">Follow-up status</h3>
        <div className="mt-3 rounded-lg border border-border bg-surface-subtle p-4">
          <p className="font-medium text-foreground">
            {latestEnrollment?.followUpStatus ?? 'Not due'}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Reviewed with participation history and journey notes; it does not change shared records
            from this view.
          </p>
        </div>
      </section>

      {unlinkedNotes.length > 0 ? (
        <div className="mt-4">
          <JourneyNoteList
            description="Legacy notes without a verified journey-stage association are preserved here and are not assigned automatically."
            notes={unlinkedNotes}
            title="Unlinked notes"
          />
        </div>
      ) : null}
    </TabsContent>
  )
}
