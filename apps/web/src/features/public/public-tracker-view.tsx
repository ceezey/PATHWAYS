import { ArrowLeft, ArrowRight, CalendarDays, MapPin, ShieldCheck, Wrench } from 'lucide-react'
import Link from 'next/link'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import type { PublicProjectSnapshot } from '@/lib/services/public-projects'

// Renders only the PRD-F13 allowlisted snapshot fields; nothing else crosses into the public view.
type Snapshot = Omit<PublicProjectSnapshot, 'publishedAt'> & { publishedAt?: string }

const notSpecified = 'Not specified'
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : null)
const period = (project: Snapshot) => {
  const start = day(project.startDate)
  const end = day(project.endDate)
  return start && end ? `${start} to ${end}` : start ? `From ${start}` : notSpecified
}
const latest = (projects: Snapshot[]) =>
  projects.reduce<string | null>(
    (value, project) =>
      project.publishedAt && (!value || project.publishedAt > value) ? project.publishedAt : value,
    null,
  )

const PublicNotice = ({ preview }: { preview?: boolean }) => (
  <section className="border-b border-info/25 bg-info-subtle">
    <div className="mx-auto flex w-full max-w-6xl items-start gap-3 px-4 py-3 text-sm text-info sm:items-center sm:px-6">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0" aria-hidden="true" />
      <p className="leading-5">
        <span className="font-semibold">
          {preview ? 'Staff preview.' : 'Approved public view.'}
        </span>{' '}
        {preview
          ? 'This is the exact approved snapshot the public page shows once published.'
          : 'Approved, non-sensitive project information only.'}
      </p>
    </div>
  </section>
)

export const PublicTrackerUnavailable = () => (
  <div className="mx-4 my-16 max-w-2xl rounded-lg border border-warning/30 bg-warning-subtle p-8 text-center text-warning sm:mx-auto">
    <Wrench className="mx-auto h-8 w-8" aria-hidden="true" />
    <h1 className="mt-4 text-2xl font-semibold">Public tracker temporarily unavailable</h1>
    <p className="mt-2">
      Public project information is temporarily unavailable. Please try again later.
    </p>
  </div>
)

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="border-l-2 border-primary pl-3">
    <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold tabular-nums text-foreground">{value}</p>
  </div>
)

const HeroFact = ({ label, value }: { label: string; value: string }) => (
  <div className="border-white/15 p-5 sm:border-l sm:first:border-l-0">
    <p className="text-xs font-semibold uppercase tracking-wide text-navy-muted">{label}</p>
    <p className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</p>
  </div>
)

export const PublicTrackerCards = ({ projects }: { projects: Snapshot[] }) =>
  projects.length === 0 ? (
    <Card className="p-8 text-center">
      <CardTitle>No current projects</CardTitle>
      <p className="mt-2 text-base leading-6 text-muted-foreground">
        Approved project summaries will appear here when they are published.
      </p>
    </Card>
  ) : (
    <ul className="grid gap-5 md:grid-cols-2">
      {projects.map((project) => (
        <li key={project.id}>
          <Card className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-navy bg-navy p-5 text-navy-foreground sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
                {project.sector ?? notSpecified}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">{project.title}</h2>
              <p className="mt-1 text-sm text-navy-muted">{project.code}</p>
            </div>
            <CardContent className="flex flex-1 flex-col gap-5 pt-6">
              <p className="line-clamp-4 text-base leading-7 text-muted-foreground">
                {project.approvedSummary}
              </p>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <Fact label="Area" value={project.area ?? notSpecified} />
                <Fact label="Project period" value={period(project)} />
              </div>
              <Button asChild className="mt-auto w-full sm:w-auto sm:self-start">
                <Link href={`/public/projects/${project.id}`}>
                  View project
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )

export const PublicTrackerHome = ({ projects }: { projects: Snapshot[] }) => {
  const sectors = new Set(projects.map((project) => project.sector).filter(Boolean)).size
  return (
    <div className="bg-surface-subtle">
      <section className="border-b border-border bg-background">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <StatusBadge tone="success">Approved public project information</StatusBadge>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              PATHWAYS Public Projects
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Read approved summaries of HDO projects. Each page is reviewed and approved by a
              separate staff member before it is published here.
            </p>
            <Button asChild>
              <Link href="/public/projects">
                View projects
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <dl className="grid gap-3 rounded-lg border border-border bg-surface-subtle p-5 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ['Published projects', String(projects.length)],
              ['Sectors', String(sectors)],
              ['Last published', day(latest(projects)) ?? 'Not yet'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-card p-4">
                <dt className="text-xs font-semibold uppercase text-primary">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Public projects
            </h2>
            <p className="text-base leading-6 text-muted-foreground">
              Cards show approved summaries only.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/public/projects">Browse all</Link>
          </Button>
        </div>
        <PublicTrackerCards projects={projects.slice(0, 4)} />
      </section>
    </div>
  )
}

export const PublicTrackerList = ({ projects }: { projects: Snapshot[] }) => (
  <div className="bg-surface-subtle">
    <section className="border-b border-border bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Public projects</h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          These pages share approved, non-sensitive project information for public review.
        </p>
      </div>
    </section>
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PublicTrackerCards projects={projects} />
    </section>
  </div>
)

export const PublicTrackerDetail = ({
  project,
  state,
}: {
  project: Snapshot
  state?: string
}) => (
  <div className="bg-surface-subtle" data-public-mode={state ? 'staff-preview' : 'public'}>
    <PublicNotice preview={Boolean(state)} />
    <section className="border-b border-navy bg-navy text-navy-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {state ? (
          <Link
            className="mb-8 inline-flex items-center gap-2 text-sm text-navy-muted hover:text-white"
            href="/transparency"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Public Tracker
          </Link>
        ) : (
          <nav
            aria-label="Breadcrumb"
            className="mb-8 flex flex-wrap items-center gap-2 text-sm text-navy-muted"
          >
            <Link className="hover:text-white" href="/">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link className="hover:text-white" href="/public/projects">
              Public projects
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-white">
              {project.title}
            </span>
          </nav>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary-subtle">
              Approved project summary
            </span>
            <span className="rounded-full border border-white/30 px-3 py-1 text-xs font-medium text-white">
              {state ?? 'Published'}
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {project.title}
          </h1>
          <p className="text-base text-navy-muted">{project.code}</p>
        </div>
        <div className="mt-9 grid overflow-hidden rounded-lg border border-white/20 bg-white/5 sm:grid-cols-3">
          <HeroFact label="Sector" value={project.sector ?? notSpecified} />
          <HeroFact label="Project period" value={period(project)} />
          <HeroFact label="Published" value={day(project.publishedAt) ?? 'Not yet published'} />
        </div>
      </div>
    </section>
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Project overview
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          About this project
        </h2>
        <p className="mt-4 whitespace-pre-line text-base leading-8 text-foreground">
          {project.approvedSummary}
        </p>
      </Card>
      <Card className="space-y-5 p-6">
        <h2 className="text-lg font-semibold text-foreground">Where and when</h2>
        <p className="flex items-center gap-3 text-base text-foreground">
          <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          {project.area ?? notSpecified}
        </p>
        <p className="flex items-center gap-3 text-base text-foreground">
          <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          {period(project)}
        </p>
        {state ? null : (
          <Button asChild variant="outline" className="w-full">
            <Link href="/public/projects">All public projects</Link>
          </Button>
        )}
      </Card>
    </div>
  </div>
)
