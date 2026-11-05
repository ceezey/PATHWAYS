'use client'

import { Eye } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { usePermission } from '@/hooks/use-permission'
import { publicMediaClient } from '@/lib/api/public-media'
import type { publicationClient } from '@/lib/api/publication'
import type { ProjectSummary } from '@/types/pathways'
import type { PublicView, PublicationSelection } from '@pathways/shared'

import { PreviewFrame, stateLabels } from './public-tracker-preview'

type Publication = NonNullable<Awaited<ReturnType<typeof publicationClient.get>>>

type DraftPreviewProps = {
  project: ProjectSummary
  current: Publication | null | undefined
  summary: string
  media: PublicationSelection['media']
  views: PublicView[]
  edited: boolean
}

// Builds the page from the editor's state; unedited, it is the frozen revision exactly.
const DraftPreviewBody = ({
  project,
  current,
  summary,
  media,
  views,
  edited,
}: DraftPreviewProps) => {
  const permitted = usePermission()
  const list = useAuthorizedRead(
    'public-media',
    project.id,
    'public.preview',
    (signal) => publicMediaClient.list(project.id, signal),
    edited && permitted('evidence.read'),
  )
  if (current && !edited)
    return (
      <PreviewFrame
        project={{
          ...current.snapshot,
          publishedAt: current.state === 'PUBLISHED' ? current.updatedAt : undefined,
        }}
        state={`${stateLabels[current.state]} · Revision ${current.revision}`}
      />
    )
  // Facts are the submitted revision's; a project without one uses the project record.
  const facts = current?.snapshot ?? {
    id: project.id,
    title: project.title,
    code: project.code ?? '',
    area: project.area,
    sector: project.sector,
    startDate: project.startDate ?? null,
    endDate: project.endDate ?? null,
  }
  const known = new Map(
    [...(current?.snapshot.media ?? []), ...(list.data?.items ?? [])].map((item) => [
      item.id,
      { type: item.type, contentType: item.contentType },
    ]),
  )
  const shown = media.flatMap((entry) => {
    const item = known.get(entry.id)
    return item ? [{ ...item, id: entry.id, caption: entry.caption }] : []
  })
  return (
    <PreviewFrame
      draft
      project={{ ...facts, approvedSummary: summary, media: shown, views }}
      state="Unsaved changes · Not submitted"
    />
  )
}

export const PublicDraftPreview = (props: DraftPreviewProps) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="ghost">
        <Eye className="mr-2 h-4 w-4" />
        Staff preview
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-6xl sm:max-w-6xl">
      <DialogHeader>
        <DialogTitle>Staff preview</DialogTitle>
        <DialogDescription>
          {props.edited
            ? 'Your current edits, including changes not yet submitted.'
            : 'The current revision as the public page shows it once published.'}
        </DialogDescription>
      </DialogHeader>
      <DraftPreviewBody {...props} />
    </DialogContent>
  </Dialog>
)
