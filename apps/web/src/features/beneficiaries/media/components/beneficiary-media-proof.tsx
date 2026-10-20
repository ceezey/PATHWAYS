'use client'

import { Camera, Eye, FileImage, Loader2, ShieldCheck, UploadCloud, Video } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { beneficiaryMediaClient } from '@/lib/api/beneficiary-media'
import type { BeneficiaryMediaItem } from '@/types/pathways'

import { formatDate } from '../../beneficiaries.utils'
import { formatMediaFileSize } from '../media.utils'
import type { LoadState } from '../media.utils'
import { AddMediaDialog } from './add-media-dialog'
import { MediaKpi } from './media-kpi'
import { MediaViewer } from './media-viewer'

type MediaFilter = 'All' | 'PHOTO' | 'VIDEO'
const filterLabels: Record<MediaFilter, string> = { All: 'All', PHOTO: 'Photos', VIDEO: 'Videos' }

export const BeneficiaryMediaProof = ({
  beneficiaryId,
  canManage,
  projectId,
}: {
  beneficiaryId: string
  canManage: boolean
  projectId: string
}) => {
  const [items, setItems] = useState<BeneficiaryMediaItem[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [filter, setFilter] = useState<MediaFilter>('All')
  const [addOpen, setAddOpen] = useState(false)
  const [viewing, setViewing] = useState<BeneficiaryMediaItem | null>(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      setItems(await beneficiaryMediaClient.listBeneficiaryMedia(projectId, beneficiaryId))
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [projectId, beneficiaryId])

  useEffect(() => {
    void load()
  }, [load])

  const photoCount = items.filter((item) => item.type === 'PHOTO').length
  const videoCount = items.filter((item) => item.type === 'VIDEO').length
  const visible = items.filter((item) => filter === 'All' || item.type === filter)

  return (
    <section
      aria-labelledby="beneficiary-media-title"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="border-b border-border bg-surface-subtle p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Beneficiary evidence
            </p>
            <h2 className="text-xl font-semibold text-foreground" id="beneficiary-media-title">
              Media proof
            </h2>
            <p className="max-w-3xl text-base leading-6 text-muted-foreground">
              Photos and videos attached to this beneficiary record. Media remains private to
              authorized staff.
            </p>
          </div>
          {canManage ? (
            <Button
              className="w-full gap-2 sm:w-auto"
              onClick={() => setAddOpen(true)}
              type="button"
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Add media
            </Button>
          ) : null}
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-info/25 bg-info-subtle p-3 text-xs leading-5 text-info">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Uploaded files are private and are not published.</p>
        </div>
      </div>

      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-3">
        <MediaKpi icon={FileImage} label="Media items" value={items.length} />
        <MediaKpi icon={Camera} label="Photos" value={photoCount} />
        <MediaKpi icon={Video} label="Videos" value={videoCount} />
      </div>

      <div className="p-4 sm:p-5">
        <fieldset className="mb-5 grid grid-cols-3 gap-2 sm:flex">
          <legend className="sr-only">Filter media proof</legend>
          {(Object.keys(filterLabels) as MediaFilter[]).map((value) => (
            <Button
              aria-pressed={filter === value}
              className="w-full sm:w-auto"
              key={value}
              onClick={() => setFilter(value)}
              size="sm"
              type="button"
              variant={filter === value ? 'default' : 'outline'}
            >
              {value === 'All' ? `All (${items.length})` : filterLabels[value]}
            </Button>
          ))}
        </fieldset>

        {loadState === 'loading' ? (
          <output className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading media proof
          </output>
        ) : loadState === 'error' ? (
          <EmptyState
            action={
              <Button onClick={() => void load()} type="button" variant="outline">
                Retry
              </Button>
            }
            description="Media proof could not be loaded."
            icon={Camera}
            title="Media proof unavailable"
            tone="danger"
          />
        ) : visible.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((item) => (
              <article
                aria-label={`Media proof: ${item.fileName}`}
                className="flex min-w-0 flex-col gap-3 rounded-sm border border-border bg-background p-4"
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium leading-6 text-foreground">
                      {item.fileName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.type === 'PHOTO' ? 'Photo' : 'Video'} ·{' '}
                      {formatMediaFileSize(item.byteSize)}
                    </p>
                  </div>
                  <StatusBadge tone="success">Uploaded</StatusBadge>
                </div>
                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {item.description ?? 'No evidence note was added.'}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">
                    {formatDate(item.submittedAt)} · {item.submittedBy}
                  </p>
                  <Button
                    aria-label={`Preview ${item.fileName}`}
                    className="shrink-0 gap-2"
                    onClick={() => setViewing(item)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Preview
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              canManage ? (
                <Button onClick={() => setAddOpen(true)} type="button" variant="outline">
                  Add media
                </Button>
              ) : undefined
            }
            description={
              canManage
                ? 'Add a photo or video to this beneficiary record.'
                : 'No photos or videos have been attached to this beneficiary record.'
            }
            icon={filter === 'VIDEO' ? Video : Camera}
            title="None yet"
          />
        )}
      </div>

      {addOpen ? (
        <AddMediaDialog
          beneficiaryId={beneficiaryId}
          onOpenChange={setAddOpen}
          onUploaded={() => void load()}
          projectId={projectId}
        />
      ) : null}
      <MediaViewer
        beneficiaryId={beneficiaryId}
        item={viewing}
        onClose={() => setViewing(null)}
        projectId={projectId}
      />
    </section>
  )
}
