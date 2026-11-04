'use client'

import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { AsyncState, ConfirmationDialog, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { usePermission } from '@/hooks/use-permission'
import { publicMediaClient } from '@/lib/api/public-media'
import type { PublicMediaListItem } from '@pathways/shared'

import { PublicMediaThumb } from './public-media-thumb'

const sourceLabel = { UPLOAD: 'New upload', BENEFICIARY: 'Beneficiary media', ACTIVITY: 'Activity' }

// Photos and videos waiting for a different reviewer to approve or reject them for the public page.
export const PublicMediaQueue = ({ projectId }: { projectId: string }) => {
  const userId = useCurrentRole().profile?.userId
  const permitted = usePermission()
  const canReadEvidence = permitted('evidence.read')
  const canApprove = permitted('public.approve')
  const list = useAuthorizedRead(
    'public-media',
    projectId,
    'public.preview',
    (signal) => publicMediaClient.list(projectId, signal),
    canReadEvidence,
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<PublicMediaListItem | null>(null)
  const [reason, setReason] = useState('')
  const waiting =
    list.data?.items.filter(
      (item) => item.publicStatus === 'FOR_REVIEW' && item.status !== 'REJECTED',
    ) ?? []

  const act = async (item: PublicMediaListItem, run: () => Promise<void>, done: string) => {
    if (busyId) return
    setBusyId(item.id)
    try {
      await run()
      toast.success(done)
      await list.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Media update unavailable.')
    } finally {
      setBusyId(null)
    }
  }
  const closeReject = () => {
    setRejecting(null)
    setReason('')
  }

  return (
    <SectionCard
      title="Awaiting public media approval"
      description="A different reviewer approves each photo or video before it can be picked for the public page."
    >
      {!canReadEvidence ? (
        <p className="text-sm text-muted-foreground">
          You need evidence access to review the media queue.
        </p>
      ) : list.isPending ? (
        <AsyncState
          status="loading"
          title="Loading media queue"
          description="Verifying current media access."
        />
      ) : list.isError ? (
        <AsyncState
          status="error"
          title="Media queue unavailable"
          description="The media waiting for approval could not be loaded."
          onRetry={() => void list.refetch()}
        />
      ) : waiting.length ? (
        <ul className="space-y-3">
          {waiting.map((item) => (
            <li className="flex flex-wrap items-center gap-3" key={item.id}>
              <PublicMediaThumb
                label={item.fileName}
                mediaId={item.id}
                projectId={projectId}
                type={item.type}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.fileName}</p>
                <p className="text-xs text-muted-foreground">{sourceLabel[item.source]}</p>
              </div>
              {canApprove ? (
                <div className="flex gap-2">
                  {item.submittedById !== userId && item.publicSubmittedById !== userId ? (
                    <Button
                      aria-label={`Approve ${item.fileName}`}
                      disabled={busyId !== null}
                      onClick={() =>
                        void act(
                          item,
                          () => publicMediaClient.approve(projectId, item.id),
                          'Media approved.',
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                      Approve
                    </Button>
                  ) : null}
                  {item.submittedById !== userId ? (
                    <Button
                      aria-label={`Reject ${item.fileName}`}
                      disabled={busyId !== null}
                      onClick={() => setRejecting(item)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <X className="mr-2 h-4 w-4" aria-hidden="true" />
                      Reject
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No media is waiting for approval.</p>
      )}
      <ConfirmationDialog
        confirmDisabled={!reason.trim() || busyId !== null}
        confirmLabel="Reject media"
        description={`Say why ${rejecting?.fileName ?? 'this media'} cannot be shown on the public page.`}
        onConfirm={() => {
          if (!rejecting) return
          const target = rejecting
          closeReject()
          void act(
            target,
            () => publicMediaClient.reject(projectId, target.id, reason.trim()),
            'Media rejected.',
          )
        }}
        onOpenChange={(open) => !open && closeReject()}
        open={rejecting !== null}
        title="Reject media"
      >
        <div className="space-y-2">
          <Label htmlFor="public-media-reject-reason">Rejection reason</Label>
          <Textarea
            id="public-media-reject-reason"
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </div>
      </ConfirmationDialog>
    </SectionCard>
  )
}
