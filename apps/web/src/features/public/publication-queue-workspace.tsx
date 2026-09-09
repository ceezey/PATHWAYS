'use client'

import { Eye, Save, Search, Send, ShieldCheck, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  approvePublication,
  publishPublication,
  unpublishPublication,
  updatePublication,
} from '@/lib/demo-state/administration'
import { useDemoState } from '@/lib/demo-state/use-demo-state'

export const PublicationQueueWorkspace = () => {
  const data = useDemoState()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(data.publications[0]?.projectId ?? '')
  const selected =
    data.publications.find((row) => row.projectId === selectedId) ?? data.publications[0]
  const [tagline, setTagline] = useState(selected?.draft.tagline ?? '')
  const [summary, setSummary] = useState(selected?.draft.approvedSummary ?? '')
  const actor = data.accounts.find((account) => account.id === data.session?.accountId)
  const visible = useMemo(
    () =>
      data.publications.filter((publication) => {
        const project = data.projects.find((row) => row.id === publication.projectId)
        const inScope = Boolean(actor?.projectIds.includes(publication.projectId))
        return (
          inScope &&
          (!query.trim() ||
            [project?.title, project?.area, project?.sector].some((value) =>
              value?.toLowerCase().includes(query.toLowerCase()),
            ))
        )
      }),
    [actor?.projectIds, data.projects, data.publications, query],
  )
  const select = (id: string) => {
    const row = data.publications.find((publication) => publication.projectId === id)
    setSelectedId(id)
    setTagline(row?.draft.tagline ?? '')
    setSummary(row?.draft.approvedSummary ?? '')
  }
  const act = (operation: () => void, success: string) => {
    try {
      operation()
      toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Publication action failed.')
    }
  }
  const stateLabel = selected?.published
    ? selected.approvedRevision === selected.revision
      ? 'Published'
      : 'Published · draft needs re-approval'
    : selected?.approvedRevision === selected?.revision
      ? 'Approved, not public'
      : 'Draft'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public accountability"
        title="Public Tracker Review"
        description="Edit an allowlisted public projection, approve the exact revision, and publish or withdraw it from the anonymous portal."
        actions={
          <Button asChild variant="outline">
            <Link href="/public/projects" target="_blank">
              <Eye className="mr-2 h-4 w-4" />
              Open anonymous portal
            </Link>
          </Button>
        }
      />
      <div className="rounded-lg border border-info/25 bg-info-subtle p-4 text-sm text-info">
        Demo data only. Publication changes update the browser-local anonymous view; no external
        site or notification service is used. Active scenario: <strong>{data.scenario}</strong>.
      </div>
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard
          title="Review queue"
          description={`${visible.length} scoped project publication records.`}
        >
          <Label className="space-y-2">
            <span>Search projects</span>
            <span className="relative block">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </Label>
          <div className="mt-4 space-y-2">
            {visible.length ? (
              visible.map((publication) => {
                const project = data.projects.find((row) => row.id === publication.projectId)
                const label = publication.published
                  ? publication.approvedRevision === publication.revision
                    ? 'Published'
                    : 'Needs re-approval'
                  : publication.approvedRevision === publication.revision
                    ? 'Approved'
                    : 'Draft'
                return (
                  <button
                    type="button"
                    className={`w-full rounded-md border p-4 text-left ${selected?.projectId === publication.projectId ? 'border-primary bg-primary-subtle' : ''}`}
                    key={publication.projectId}
                    onClick={() => select(publication.projectId)}
                  >
                    <span className="font-semibold">
                      {project?.title ?? publication.draft.title}
                    </span>
                    <span className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Revision {publication.revision}
                      </span>
                      <StatusBadge
                        tone={
                          label === 'Published'
                            ? 'success'
                            : label === 'Needs re-approval'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {label}
                      </StatusBadge>
                    </span>
                  </button>
                )
              })
            ) : (
              <EmptyState
                title="No projects match"
                description="Try another title, area, or sector."
              />
            )}
          </div>
        </SectionCard>
        <SectionCard
          title={selected?.draft.title ?? 'Public content'}
          description="Only this curated projection can cross into the anonymous route; internal notes, people, expenses, and audit events are excluded."
        >
          {selected ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={stateLabel.startsWith('Published') ? 'success' : 'warning'}>
                  {stateLabel}
                </StatusBadge>
                <span className="text-sm text-muted-foreground">
                  Draft revision {selected.revision}; approved revision{' '}
                  {selected.approvedRevision ?? 'none'}
                </span>
              </div>
              <Label className="space-y-2">
                <span>Public tagline</span>
                <Input value={tagline} onChange={(event) => setTagline(event.target.value)} />
              </Label>
              <Label className="space-y-2">
                <span>Approved public summary</span>
                <Textarea
                  rows={6}
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                />
              </Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    act(
                      () =>
                        updatePublication(selected.projectId, {
                          tagline,
                          approvedSummary: summary,
                        }),
                      'Draft saved; this new revision now requires approval.',
                    )
                  }
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save draft
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    act(
                      () => approvePublication(selected.projectId),
                      'Current public revision approved.',
                    )
                  }
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Approve revision
                </Button>
                <Button
                  onClick={() =>
                    act(
                      () => publishPublication(selected.projectId),
                      'Approved revision published to the anonymous local portal.',
                    )
                  }
                >
                  <Send className="mr-2 h-4 w-4" />
                  Publish
                </Button>
                {selected.published ? (
                  <Button
                    variant="destructive"
                    onClick={() =>
                      act(
                        () => unpublishPublication(selected.projectId),
                        'Project removed from the anonymous local portal.',
                      )
                    }
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Unpublish
                  </Button>
                ) : null}
              </div>
              <Button asChild variant="ghost">
                <Link href={`/projects/${selected.projectId}/transparency/preview`}>
                  Open full staff preview
                </Link>
              </Button>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  )
}
