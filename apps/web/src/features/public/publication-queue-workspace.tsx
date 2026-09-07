'use client'

import { Eye, Search, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mockProjects } from '@/mocks/pathways/projects'

const publicationStateByProject: Record<
  string,
  { state: string; tone: 'success' | 'warning' | 'neutral'; version: string; review: string }
> = {
  'futuremakers-ncr': {
    state: 'Published',
    tone: 'success',
    version: 'v4',
    review: 'Approved 07 Sep 2026',
  },
  'youth-rise-western-samar': {
    state: 'Needs re-approval',
    tone: 'warning',
    version: 'v3 draft',
    review: 'Project details changed',
  },
  'grassroots-centers-navotas': {
    state: 'In review',
    tone: 'warning',
    version: 'v2',
    review: 'Submitted 06 Sep 2026',
  },
  'girls-lead-metro-manila': {
    state: 'Incomplete',
    tone: 'neutral',
    version: 'v1 draft',
    review: 'Missing approved highlights',
  },
  'safe-spaces-northern-samar': {
    state: 'Not public',
    tone: 'neutral',
    version: 'No version',
    review: 'Disclosure review required',
  },
}

export const PublicationQueueWorkspace = () => {
  const [query, setQuery] = useState('')
  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? mockProjects.filter((project) =>
          [project.title, project.area, project.sector].some((value) =>
            value.toLocaleLowerCase().includes(normalized),
          ),
        )
      : mockProjects
  }, [query])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Public accountability"
        title="Public Tracker Review"
        description="Review which project summaries are prepared, awaiting approval, published, or withheld from the anonymous portal."
      />

      <div className="rounded-lg border border-info/25 bg-info-subtle px-4 py-3 text-sm leading-6 text-info">
        Publication states are synthetic. Preview edits stay in this browser, and no action
        publishes, unpublishes, or changes public data.
      </div>

      <SectionCard
        title="Review queue"
        description={`${visibleProjects.length} project${visibleProjects.length === 1 ? '' : 's'} available in this preview.`}
        actions={
          <Button asChild variant="outline">
            <Link href="/public/projects" target="_blank">
              <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
              Open anonymous portal
            </Link>
          </Button>
        }
      >
        <div className="mb-5 max-w-md space-y-2">
          <Label htmlFor="publication-search">Search projects</Label>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="publication-search"
              className="pl-9"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </div>
        {visibleProjects.length ? (
          <div className="divide-y rounded-md border">
            {visibleProjects.map((project) => {
              const publication = publicationStateByProject[project.id] ?? {
                state: 'Not public',
                tone: 'neutral' as const,
                version: 'No version',
                review: 'Review required',
              }
              return (
                <article
                  key={project.id}
                  className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{project.title}</h2>
                      <StatusBadge tone={publication.tone}>{publication.state}</StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {project.area} · {project.sector}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span>Public version: {publication.version}</span>
                      <span>{publication.review}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/projects/${project.id}/transparency`}>Review fields</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/projects/${project.id}/transparency/preview`}>
                        <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                        Preview
                      </Link>
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            title="No projects match"
            description="Try a project name, area, or sector."
          />
        )}
      </SectionCard>
    </div>
  )
}
