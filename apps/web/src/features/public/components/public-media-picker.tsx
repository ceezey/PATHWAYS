'use client'

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AsyncState } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { usePermission } from '@/hooks/use-permission'
import { PathwaysClientError } from '@/lib/api/core/request'
import { publicMediaClient } from '@/lib/api/public-media'
import {
  MAX_PUBLIC_MEDIA_LISTED,
  type PublicMediaListItem,
  type PublicationSelection,
} from '@pathways/shared'

import { AddPublicMediaDialog } from './add-public-media-dialog'
import { PublicMediaStepUpNote } from './public-media-step-up-note'
import { PublicMediaThumb } from './public-media-thumb'

const MAX_MEDIA = 24
type Picked = PublicationSelection['media']

// Why an item that is not pickable cannot be picked yet.
const notPickable = (item: PublicMediaListItem) =>
  item.status === 'REJECTED'
    ? `Rejected: ${item.rejectionReason ?? 'no reason recorded'}`
    : item.publicStatus === 'FOR_REVIEW'
      ? 'Awaiting public media approval'
      : 'Not approved yet'

// Chooses, captions and orders the photos and videos of the public page, from the system or newly uploaded.
export const PublicMediaPicker = ({
  disabled = false,
  onBlockedChange,
  onChange,
  projectId,
  value,
}: {
  disabled?: boolean
  onBlockedChange?: (blocked: boolean) => void
  onChange: (next: Picked) => void
  projectId: string
  value: Picked
}) => {
  const permitted = usePermission()
  const canReadEvidence = permitted('evidence.read')
  const list = useAuthorizedRead(
    'public-media',
    projectId,
    'public.preview',
    (signal) => publicMediaClient.list(projectId, signal),
    canReadEvidence,
  )
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const items = list.data?.items ?? []
  const byId = new Map(items.map((item) => [item.id, item]))
  const noEvidence =
    !canReadEvidence ||
    (list.isError && list.error instanceof PathwaysClientError && list.error.code === 'forbidden')
  const full = value.length >= MAX_MEDIA
  // A missing item counts only when the list is complete: loaded, under the cap and with no beneficiary rows hidden.
  const complete =
    list.data !== undefined &&
    !list.isError &&
    items.length < MAX_PUBLIC_MEDIA_LISTED &&
    !list.data.beneficiaryMediaNeedsStepUp
  const unpublishable = (id: string) => {
    const known = byId.get(id)
    return known ? !known.pickable : complete
  }
  const blocked = value.some((entry) => unpublishable(entry.id))
  useEffect(() => {
    onBlockedChange?.(blocked)
    return () => onBlockedChange?.(false)
  }, [blocked, onBlockedChange])

  const edit = (index: number, caption: string) =>
    onChange(value.map((entry, at) => (at === index ? { ...entry, caption } : entry)))
  const move = (index: number, step: -1 | 1) => {
    const next = [...value]
    ;[next[index], next[index + step]] = [next[index + step], next[index]]
    onChange(next)
  }
  const send = async (item: PublicMediaListItem) => {
    if (sending) return
    setSending(item.id)
    try {
      await publicMediaClient.submit(projectId, item.id)
      toast.success('Sent for public approval.')
      await list.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Media could not be sent for approval.')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Photos and videos</h3>
        <p className="text-xs text-muted-foreground">
          Up to {MAX_MEDIA}. Each needs a public caption, and the order below is the order shown.
        </p>
      </div>
      {value.length ? (
        <ul aria-label="Chosen media" className="space-y-3">
          {value.map((entry, index) => {
            const known = byId.get(entry.id)
            const name = known?.fileName ?? `Media ${index + 1}`
            return (
              <li className="flex flex-wrap items-start gap-3" key={entry.id}>
                {known && canReadEvidence ? (
                  <PublicMediaThumb
                    label={name}
                    mediaId={entry.id}
                    projectId={projectId}
                    type={known.type}
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    aria-invalid={!entry.caption.trim()}
                    aria-label={`Public caption for ${name}`}
                    disabled={disabled}
                    maxLength={300}
                    onChange={(event) => edit(index, event.target.value)}
                    placeholder="Public caption"
                    value={entry.caption}
                  />
                  <p className="truncate text-xs text-muted-foreground">{name}</p>
                  {unpublishable(entry.id) ? (
                    <p className="text-xs text-destructive">
                      No longer publishable. Remove it to submit.
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    aria-label={`Move ${name} up`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Move ${name} down`}
                    disabled={disabled || index === value.length - 1}
                    onClick={() => move(index, 1)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Remove ${name}`}
                    disabled={disabled}
                    onClick={() => onChange(value.filter((_, at) => at !== index))}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No photos or videos chosen yet.</p>
      )}
      {value.some((entry) => !entry.caption.trim()) ? (
        <p className="text-sm text-destructive" role="alert">
          A caption is required for every photo or video.
        </p>
      ) : null}
      {blocked ? (
        <p className="text-sm text-destructive" role="alert">
          A chosen photo or video is no longer publishable. Remove it to submit.
        </p>
      ) : null}

      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">From the system</TabsTrigger>
          <TabsTrigger value="upload">Upload new</TabsTrigger>
        </TabsList>
        <TabsContent className="space-y-3 pt-3" value="system">
          {list.data?.beneficiaryMediaNeedsStepUp ? (
            <PublicMediaStepUpNote onVerified={() => void list.refetch()} />
          ) : null}
          {noEvidence ? (
            <p className="text-sm text-muted-foreground">
              You need evidence access to pick existing media. Upload new instead.
            </p>
          ) : list.isPending ? (
            <AsyncState
              status="loading"
              title="Loading media"
              description="Verifying current media access."
            />
          ) : list.isError ? (
            <AsyncState
              status="error"
              title="Media unavailable"
              description="The project media could not be loaded."
              onRetry={() => void list.refetch()}
            />
          ) : items.length ? (
            <ul aria-label="Existing media" className="space-y-3">
              {items.map((item) => (
                <li className="flex flex-wrap items-center gap-3" key={item.id}>
                  <PublicMediaThumb
                    label={item.fileName}
                    mediaId={item.id}
                    projectId={projectId}
                    type={item.type}
                  />
                  <p className="min-w-0 flex-1 truncate text-sm">{item.fileName}</p>
                  {item.pickable ? (
                    value.some((entry) => entry.id === item.id) ? (
                      <span className="text-sm text-muted-foreground">Added</span>
                    ) : (
                      <Button
                        aria-label={`Add ${item.fileName}`}
                        disabled={disabled || full}
                        onClick={() => onChange([...value, { id: item.id, caption: '' }])}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Add
                      </Button>
                    )
                  ) : item.source === 'BENEFICIARY' &&
                    item.publicStatus === 'PRIVATE' &&
                    item.status !== 'REJECTED' ? (
                    <Button
                      disabled={disabled || sending !== null}
                      onClick={() => void send(item)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Send for public approval
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">{notPickable(item)}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              This project has no photos or videos yet. Upload new to add some.
            </p>
          )}
        </TabsContent>
        <TabsContent className="space-y-3 pt-3" value="upload">
          <p className="text-sm text-muted-foreground">
            Add a photo or video made for the public page. A different reviewer approves it before
            you can pick it.
          </p>
          <Button
            disabled={disabled}
            onClick={() => setUploading(true)}
            type="button"
            variant="outline"
          >
            Choose photos or videos
          </Button>
        </TabsContent>
      </Tabs>
      {uploading ? (
        <AddPublicMediaDialog
          onOpenChange={setUploading}
          onUploaded={() => canReadEvidence && void list.refetch()}
          projectId={projectId}
        />
      ) : null}
    </div>
  )
}
