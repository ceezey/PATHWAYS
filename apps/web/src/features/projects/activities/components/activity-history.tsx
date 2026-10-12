import { ClipboardCheck, FileText, UploadCloud } from 'lucide-react'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import type { Activity, ActivityProof } from '@/types/pathways'

import { categoryLabels } from '../activities.copy'
import { formatDate } from '../activities.utils'
import { formatProofDate, groupProofsByUpdate, proofTone } from '../activity-proof.utils'
import { ActivityProofFiles } from './activity-proof-files'

export const ActivityHistory = ({
  activity,
  canDecideProof,
  canOpenProof,
  canValidateProof,
  onSubmitProof,
  requestedProofId,
  setReviewTarget,
  showSubmitProof,
}: {
  activity: Activity
  canDecideProof: boolean
  canOpenProof: boolean
  canValidateProof: boolean
  onSubmitProof: (activity: Activity) => void
  requestedProofId?: string
  setReviewTarget: (target: { mode: 'validate' | 'decide'; proof: ActivityProof }) => void
  showSubmitProof: boolean
}) => (
  <>
    <section aria-labelledby={`proof-history-${activity.id}`}>
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground" id={`proof-history-${activity.id}`}>
          Submitted update & proof history
        </h3>
      </div>
      {activity.submittedProof.length > 0 ? (
        <div className="mt-3 space-y-3">
          {groupProofsByUpdate(activity.submittedProof)
            .map((proof, index) => ({ proof, version: index + 1 }))
            .reverse()
            .map(({ proof, version }, reverseIndex) => {
              const isLatest = reverseIndex === 0
              const highlighted = Boolean(
                requestedProofId &&
                  (proof.proofIds.includes(requestedProofId) ||
                    proof.updateId === requestedProofId),
              )
              const proofUpdate = activity.updateNotes.find(
                (update) => update.id === proof.updateId,
              )
              const returnedUpdate = proof.status === 'Flagged' ? proofUpdate : undefined
              const progress = proofUpdate?.progress ?? activity.progress
              return (
                <article
                  className={`rounded-xl border bg-background p-4 ${
                    highlighted ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  }`}
                  data-update-id={proof.updateId}
                  id={`activity-proof-${proof.id}`}
                  key={proof.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Version {version} · {progress}%
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Submitted {formatProofDate(proof.submittedAt)}
                      </p>
                    </div>
                    <StatusBadge tone={proofTone(proof.status)}>{proof.status}</StatusBadge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {proof.note || 'No update note recorded.'}
                  </p>
                  <div className="mt-3">
                    <ActivityProofFiles
                      activityId={activity.id}
                      canOpen={canOpenProof}
                      projectId={activity.projectId}
                      proof={proof}
                    />
                  </div>
                  {proof.status === 'Flagged' ? (
                    <div className="mt-3 rounded-xl border border-danger/25 bg-danger-subtle p-3 text-sm text-danger">
                      <p>This proof was returned for correction.</p>
                      {returnedUpdate?.reviewReason ? (
                        <p className="mt-1">
                          {returnedUpdate.reviewedBy
                            ? `Returned by ${returnedUpdate.reviewedBy}: `
                            : 'Return reason: '}
                          {returnedUpdate.reviewReason}
                        </p>
                      ) : null}
                      {isLatest && showSubmitProof && activity.status !== 'Completed' ? (
                        <Button
                          className="mt-3 gap-2"
                          onClick={() => onSubmitProof(activity)}
                          size="sm"
                          type="button"
                        >
                          <UploadCloud className="h-4 w-4" aria-hidden="true" />
                          Submit correction
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {isLatest &&
                  canValidateProof &&
                  proof.status === 'Submitted' &&
                  activity.storedStatus !== 'FOR_REVIEW' ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Waiting for the officer to finish uploading this proof. It can be reviewed
                      once every file is submitted.
                    </p>
                  ) : null}
                  {isLatest &&
                  canValidateProof &&
                  proof.status === 'Submitted' &&
                  activity.storedStatus === 'FOR_REVIEW' ? (
                    <Button
                      className="mt-4 gap-2"
                      onClick={() => setReviewTarget({ mode: 'validate', proof })}
                      size="sm"
                      type="button"
                    >
                      <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                      Review & validate proof
                    </Button>
                  ) : null}
                  {isLatest && canDecideProof && proof.status === 'Accepted' ? (
                    <Button
                      className="mt-4 gap-2"
                      onClick={() => setReviewTarget({ mode: 'decide', proof })}
                      size="sm"
                      type="button"
                    >
                      <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                      Review decision
                    </Button>
                  ) : null}
                </article>
              )
            })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {activity.updateNotes.length > 0
            ? 'No proof has been submitted.'
            : 'No update or proof has been submitted.'}
        </p>
      )}
    </section>

    {activity.updateNotes.length > 0 ? (
      <section aria-labelledby={`update-history-${activity.id}`}>
        <h3 className="text-sm font-semibold text-foreground" id={`update-history-${activity.id}`}>
          Notes
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {[...activity.updateNotes].reverse().map((update) => (
            <li
              className="relative border-l-2 border-border py-1 pl-4 before:absolute before:-left-[5px] before:top-2.5 before:h-2 before:w-2 before:rounded-full before:bg-primary"
              key={update.id}
            >
              <span className="font-medium text-foreground">{update.progress}%</span> ·{' '}
              {update.note}
              {update.kind === 'progress' ? (
                <span className="ml-1 text-xs">
                  (progress note{update.status === 'Submitted' ? ', awaiting review' : ''})
                </span>
              ) : null}
              {update.kind === 'progress' &&
              canValidateProof &&
              update.status === 'Submitted' &&
              activity.storedStatus === 'IN_PROGRESS' ? (
                <Button
                  className="mt-2 gap-2"
                  onClick={() =>
                    setReviewTarget({
                      mode: 'validate',
                      proof: {
                        id: update.id,
                        updateId: update.id,
                        fileName: '',
                        status: 'Submitted',
                        submittedAt: update.submittedAt,
                        submittedBy: update.submittedBy,
                        updateUpdatedAt: update.updatedAt,
                        note: update.note,
                      },
                    })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  Review progress
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null}

    {activity.overdueExplanations.length > 0 || activity.status === 'Overdue' ? (
      <section aria-labelledby={`overdue-explanations-${activity.id}`}>
        <h3
          className="text-sm font-semibold text-foreground"
          id={`overdue-explanations-${activity.id}`}
        >
          Overdue explanations
        </h3>
        {activity.overdueExplanations.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {activity.overdueExplanations.map((entry) => (
              <li
                className="relative border-l-2 border-border py-1 pl-4 before:absolute before:-left-[5px] before:top-2.5 before:h-2 before:w-2 before:rounded-full before:bg-primary"
                key={entry.id}
              >
                <span className="font-medium text-foreground">
                  {categoryLabels[entry.category]}
                </span>{' '}
                · {formatDate(entry.recordedAt)} · {entry.actorName}
                <p className="mt-1 leading-6">{entry.explanation}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            None yet.
          </p>
        )}
      </section>
    ) : null}
  </>
)
