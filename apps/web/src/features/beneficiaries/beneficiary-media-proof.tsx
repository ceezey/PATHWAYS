'use client'

import {
  CalendarDays,
  Camera,
  Eye,
  FileImage,
  HardDrive,
  Play,
  ShieldCheck,
  Tags,
  UploadCloud,
  Video,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/pathways/empty-state'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  Activity,
  BeneficiaryMediaProofRecord,
  BeneficiaryMediaReviewStatus,
  BeneficiaryMediaType,
  ProjectSummary,
} from '@/types/pathways'

import {
  beneficiaryMediaReviewTone,
  beneficiaryMediaTypeFromMime,
  formatMediaDuration,
  formatMediaFileSize,
  isSupportedBeneficiaryMedia,
} from './beneficiary-media-utils'
import { formatDate, projectTitle } from './beneficiary-utils'

type MediaProofWithPreview = BeneficiaryMediaProofRecord & {
  previewUrl?: string
}

type LocalFilePreview = {
  file: File
  mediaType: BeneficiaryMediaType
  previewUrl: string
}

type MediaFilter = 'All' | BeneficiaryMediaType

const maxLocalFiles = 4
const maxLocalFileSize = 50_000_000

export const BeneficiaryMediaProof = ({
  activities,
  mediaProof,
  projects,
}: {
  activities: Activity[]
  beneficiaryId: string
  mediaProof: BeneficiaryMediaProofRecord[]
  projectIds: string[]
  projects: ProjectSummary[]
}) => {
  const mediaItems: MediaProofWithPreview[] = mediaProof
  const [filter, setFilter] = useState<MediaFilter>('All')
  const [addOpen, setAddOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [selectedFilePreviews, setSelectedFilePreviews] = useState<LocalFilePreview[]>([])
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 10))
  const [activityId, setActivityId] = useState(activities[0]?.id ?? 'none')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')
  const [addError, setAddError] = useState('')
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState<BeneficiaryMediaReviewStatus>('For Review')
  const [reviewNote, setReviewNote] = useState('')
  const objectUrls = useRef<string[]>([])

  const clearLocalPreviews = () => {
    for (const url of objectUrls.current) {
      URL.revokeObjectURL(url)
    }

    objectUrls.current = []
    setSelectedFilePreviews([])
  }

  useEffect(
    () => () => {
      for (const url of objectUrls.current) {
        URL.revokeObjectURL(url)
      }
    },
    [],
  )

  const selectedMedia = mediaItems.find((item) => item.id === selectedMediaId) ?? null
  const visibleMedia = mediaItems.filter((item) => filter === 'All' || item.mediaType === filter)
  const photoCount = mediaItems.filter((item) => item.mediaType === 'Photo').length
  const videoCount = mediaItems.filter((item) => item.mediaType === 'Video').length
  const reviewCount = mediaItems.filter((item) => item.reviewStatus === 'For Review').length

  const openAddDialog = () => {
    clearLocalPreviews()
    setSelectedFiles([])
    setCapturedAt(new Date().toISOString().slice(0, 10))
    setActivityId(activities[0]?.id ?? 'none')
    setNote('')
    setTags('')
    setAddError('')
    setAddOpen(true)
  }

  const selectLocalFiles = (files: File[]) => {
    clearLocalPreviews()

    if (files.length > maxLocalFiles) {
      setSelectedFiles([])
      setAddError(`Choose up to ${maxLocalFiles} photo or video files at a time.`)
      return
    }

    if (files.some((file) => !isSupportedBeneficiaryMedia(file.type))) {
      setSelectedFiles([])
      setAddError('Use JPG, PNG, or MP4 files for the staged preview.')
      return
    }

    if (files.some((file) => file.size > maxLocalFileSize)) {
      setSelectedFiles([])
      setAddError('Each staged file must be 50 MB or smaller.')
      return
    }

    setSelectedFiles(files)
    const previews = files.flatMap<LocalFilePreview>((file) => {
      const mediaType = beneficiaryMediaTypeFromMime(file.type)

      if (!mediaType) {
        return []
      }

      const previewUrl = URL.createObjectURL(file)
      objectUrls.current.push(previewUrl)
      return [{ file, mediaType, previewUrl }]
    })
    setSelectedFilePreviews(previews)
    setAddError('')
  }

  const addLocalMedia = () => {
    if (selectedFiles.length === 0) {
      setAddError('Choose at least one photo or video to stage.')
      return
    }

    if (!capturedAt) {
      setAddError('Add the date the proof was captured.')
      return
    }

    toast.error('Media was not uploaded.', {
      description: 'The beneficiary media backend is not configured. Selected files remain staged.',
    })
  }

  const openReview = (item: MediaProofWithPreview) => {
    setSelectedMediaId(item.id)
    setReviewStatus(item.reviewStatus)
    setReviewNote(item.reviewNote ?? '')
  }

  const saveReview = () => {
    if (!selectedMedia) {
      return
    }

    toast.error('Media review was not saved.', {
      description: 'The beneficiary media backend is not configured. Your review draft remains.',
    })
  }

  return (
    <section
      aria-labelledby="beneficiary-media-title"
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border bg-muted/30 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Beneficiary evidence
              </p>
              <StatusBadge tone="warning">Backend not configured</StatusBadge>
            </div>
            <h2 className="text-xl font-semibold text-foreground" id="beneficiary-media-title">
              Media proof
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Review photos and videos connected to this beneficiary record, or stage local files
              for a future upload integration.
            </p>
          </div>
          <Button className="w-full gap-2 sm:w-auto" onClick={openAddDialog} type="button">
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            Stage media files
          </Button>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-info/20 bg-info/10 p-3 text-xs leading-5 text-info">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Files selected here are previewed with temporary browser blob URLs. They are not added
            to the record, uploaded, synced, or published.
          </p>
        </div>
      </div>

      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <MediaKpi icon={FileImage} label="Media items" value={mediaItems.length} />
        <MediaKpi icon={Camera} label="Photos" value={photoCount} />
        <MediaKpi icon={Video} label="Videos" value={videoCount} />
        <MediaKpi icon={Eye} label="For review" value={reviewCount} />
      </div>

      <div className="p-4 sm:p-5">
        <fieldset className="mb-5 grid grid-cols-3 gap-2 sm:flex">
          <legend className="sr-only">Filter media proof</legend>
          {(['All', 'Photo', 'Video'] as const).map((value) => (
            <Button
              aria-pressed={filter === value}
              className="w-full sm:w-auto"
              key={value}
              onClick={() => setFilter(value)}
              size="sm"
              type="button"
              variant={filter === value ? 'default' : 'outline'}
            >
              {value === 'All' ? `All (${mediaItems.length})` : `${value}s`}
            </Button>
          ))}
        </fieldset>

        {visibleMedia.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleMedia.map((item) => (
              <MediaProofCard
                activities={activities}
                item={item}
                key={item.id}
                onReview={() => openReview(item)}
                projects={projects}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <Button onClick={openAddDialog} type="button" variant="outline">
                Stage media files
              </Button>
            }
            description={`No ${filter.toLowerCase()} records were returned. You can stage a local file preview without adding it to this beneficiary record.`}
            icon={filter === 'Video' ? Video : Camera}
            title={`No ${filter.toLowerCase()} proof items`}
          />
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          setAddOpen(open)

          if (!open) {
            clearLocalPreviews()
            setSelectedFiles([])
          }
        }}
        open={addOpen}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stage media files</DialogTitle>
            <DialogDescription>
              Choose photos or videos to inspect before upload. Files remain only in this dialog and
              are not added to the beneficiary record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="beneficiary-media-files">Photo or video files</Label>
              <Input
                accept="image/jpeg,image/png,video/mp4"
                id="beneficiary-media-files"
                multiple
                onChange={(event) => selectLocalFiles(Array.from(event.target.files ?? []))}
                type="file"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                JPG, PNG, or MP4 · up to four files · 50 MB per local preview.
              </p>
            </div>

            {selectedFiles.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                <p className="text-sm font-medium text-foreground">Staged file previews</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedFilePreviews.map(({ file, mediaType, previewUrl }) => (
                    <div
                      className="overflow-hidden rounded-md border border-border"
                      key={previewUrl}
                    >
                      {mediaType === 'Photo' ? (
                        <img
                          alt={`Staged preview: ${file.name}`}
                          className="aspect-video w-full object-cover"
                          src={previewUrl}
                        />
                      ) : (
                        <video
                          aria-label={`Staged video preview: ${file.name}`}
                          className="aspect-video w-full bg-slate-950 object-contain"
                          controls
                          muted
                          preload="metadata"
                          src={previewUrl}
                        />
                      )}
                      <div className="flex items-center justify-between gap-3 p-2 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">{file.name}</span>
                        <span className="shrink-0">{formatMediaFileSize(file.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="beneficiary-media-date">Captured date</Label>
                <Input
                  id="beneficiary-media-date"
                  onChange={(event) => setCapturedAt(event.target.value)}
                  type="date"
                  value={capturedAt}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beneficiary-media-activity">Activity context</Label>
                <Select onValueChange={setActivityId} value={activityId}>
                  <SelectTrigger id="beneficiary-media-activity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No activity selected</SelectItem>
                    {activities.map((activity) => (
                      <SelectItem key={activity.id} value={activity.id}>
                        {activity.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beneficiary-media-note">Evidence note (optional)</Label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="beneficiary-media-note"
                maxLength={320}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Describe what the media shows and why it supports the record."
                value={note}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="beneficiary-media-tags">Tags (optional)</Label>
              <Input
                id="beneficiary-media-tags"
                maxLength={220}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Skills session, attendance context"
                value={tags}
              />
              <p className="text-xs text-muted-foreground">Separate up to six tags with commas.</p>
            </div>
          </div>

          {addError ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {addError}
            </p>
          ) : null}

          <DialogFooter>
            <Button onClick={() => setAddOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button className="gap-2" onClick={addLocalMedia} type="button">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Attempt upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMediaId(null)
          }
        }}
        open={Boolean(selectedMedia)}
      >
        {selectedMedia ? (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review media proof</DialogTitle>
              <DialogDescription>
                Review {selectedMedia.fileName}. Saving requires the beneficiary media backend.
              </DialogDescription>
            </DialogHeader>

            <MediaPreview item={selectedMedia} large />

            <div className="grid gap-3 sm:grid-cols-2">
              <MetadataRow
                label="File type"
                value={`${selectedMedia.mediaType} · ${selectedMedia.mimeType}`}
              />
              <MetadataRow
                label="File size"
                value={formatMediaFileSize(selectedMedia.fileSizeBytes)}
              />
              <MetadataRow label="Captured" value={formatDate(selectedMedia.capturedAt)} />
              <MetadataRow label="Added by" value={selectedMedia.addedBy} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="beneficiary-media-review-status">Review status</Label>
              <Select
                onValueChange={(value) => setReviewStatus(value as BeneficiaryMediaReviewStatus)}
                value={reviewStatus}
              >
                <SelectTrigger id="beneficiary-media-review-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="For Review">For Review</SelectItem>
                  <SelectItem value="Accepted">Accepted</SelectItem>
                  <SelectItem value="Needs Clarification">Needs Clarification</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beneficiary-media-review-note">Review note (optional)</Label>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                id="beneficiary-media-review-note"
                maxLength={320}
                onChange={(event) => setReviewNote(event.target.value)}
                value={reviewNote}
              />
            </div>

            <DialogFooter>
              <Button onClick={() => setSelectedMediaId(null)} type="button" variant="outline">
                Close
              </Button>
              <Button onClick={saveReview} type="button">
                Save review
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  )
}

const MediaProofCard = ({
  activities,
  item,
  onReview,
  projects,
}: {
  activities: Activity[]
  item: MediaProofWithPreview
  onReview: () => void
  projects: ProjectSummary[]
}) => {
  const activity = activities.find((record) => record.id === item.activityId)
  const duration = formatMediaDuration(item.durationSeconds)

  return (
    <article
      aria-label={`Media proof: ${item.fileName}`}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background"
    >
      <MediaPreview item={item} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words font-medium leading-6 text-foreground">{item.fileName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.mediaType} · {formatMediaFileSize(item.fileSizeBytes)}
              {duration ? ` · ${duration}` : ''}
            </p>
          </div>
          <StatusBadge tone={beneficiaryMediaReviewTone(item.reviewStatus)}>
            {item.reviewStatus}
          </StatusBadge>
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {item.note ?? 'No evidence note was added.'}
        </p>

        {item.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <span
                className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Captured {formatDate(item.capturedAt)}
          </p>
          <p className="flex items-center gap-2">
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            {item.source} · {projectTitle(item.projectId, projects)}
          </p>
          {activity ? (
            <p className="flex items-start gap-2">
              <Tags className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{activity.title}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p className="min-w-0 truncate text-xs text-muted-foreground">Added by {item.addedBy}</p>
          <Button
            aria-label={`Review ${item.fileName}`}
            className="shrink-0"
            onClick={onReview}
            size="sm"
            type="button"
            variant="outline"
          >
            Review
          </Button>
        </div>
      </div>
    </article>
  )
}

const MediaPreview = ({
  item,
  large = false,
}: { item: MediaProofWithPreview; large?: boolean }) => {
  const previewClassName = large ? 'h-56 sm:h-72' : 'aspect-video'

  if (item.previewUrl && item.mediaType === 'Photo') {
    return (
      <div className={previewClassName}>
        {/* Object URLs for selected files cannot use the Next.js image optimizer. */}
        <img
          alt={`Local proof preview: ${item.fileName}`}
          className="h-full w-full object-cover"
          src={item.previewUrl}
        />
      </div>
    )
  }

  if (item.previewUrl && item.mediaType === 'Video') {
    return (
      <video
        aria-label={`Local video proof preview: ${item.fileName}`}
        className={`${previewClassName} w-full bg-slate-950 object-contain`}
        controls
        muted
        preload="metadata"
        src={item.previewUrl}
      />
    )
  }

  return (
    <div
      className={`${previewClassName} relative flex items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#0f766e,#1d4ed8)] text-white`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_42%)]" />
      <div className="relative flex flex-col items-center gap-3 text-center">
        {item.mediaType === 'Video' ? (
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-slate-950/35">
            <Play className="ml-1 h-6 w-6" fill="currentColor" aria-hidden="true" />
          </span>
        ) : (
          <Camera className="h-11 w-11" aria-hidden="true" />
        )}
        <div>
          <p className="text-sm font-semibold">{item.mediaType} preview unavailable</p>
          <p className="mt-1 text-xs text-white/80">No retrievable media URL was provided</p>
        </div>
      </div>
      <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-slate-950/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
        Metadata only
      </span>
    </div>
  )
}

const MediaKpi = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Camera
  label: string
  value: number
}) => (
  <article className="flex items-start justify-between gap-3 bg-card p-4 sm:p-5">
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  </article>
)

const MetadataRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
  </div>
)
