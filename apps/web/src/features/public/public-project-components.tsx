import { ArrowRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PublicProjectRecord } from '@/types/pathways'

import { PublicPortfolioChart } from './public-project-charts'

export { PublicProjectDetail } from './public-project-detail'

export const PublicHomeDashboard = ({ projects }: { projects: PublicProjectRecord[] }) => (
  <div className="bg-surface-subtle">
    <section className="border-b border-border bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-5">
          <StatusBadge tone="success">Approved public project information</StatusBadge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              PATHWAYS Public Project Dashboard
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Browse HDO project summaries, selected indicators, milestones, and accomplishments
              that have been cleared for public viewing.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/public/projects">
                View projects
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-subtle p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-primary">Portfolio snapshot</p>
              <p className="text-base text-muted-foreground">Selected indicator progress</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          {projects.length > 0 ? (
            <PublicPortfolioChart projects={projects} />
          ) : (
            <div className="flex min-h-56 items-center justify-center rounded-sm bg-muted p-6 text-center">
              <p className="max-w-xs text-base leading-6 text-muted-foreground">
                The portfolio snapshot will appear when an approved public project is available.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>

    <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Public projects</h2>
          <p className="text-base leading-6 text-muted-foreground">
            Project cards show approved summaries and aggregate progress only.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/public/projects">Browse all</Link>
        </Button>
      </div>
      <PublicProjectCards projects={projects} />
    </section>
  </div>
)

export const PublicProjectsList = ({ projects }: { projects: PublicProjectRecord[] }) => (
  <div className="bg-surface-subtle">
    <section className="border-b border-border bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-semibold uppercase text-primary">Public Programs Dashboard</p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Projects</h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          These pages share approved, non-sensitive project information for public review.
        </p>
      </div>
    </section>
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <PublicProjectCards projects={projects} />
    </section>
  </div>
)

const PublicProjectCards = ({ projects }: { projects: PublicProjectRecord[] }) => (
  <div className="grid gap-5 md:grid-cols-2">
    {projects.length === 0 ? (
      <Card className="p-8 text-center md:col-span-2">
        <CardTitle>No public projects are available yet</CardTitle>
        <p className="mt-2 text-base leading-6 text-muted-foreground">
          Approved project summaries will appear here when they are ready for public viewing.
        </p>
      </Card>
    ) : null}
    {projects.map((project) => (
      <Card key={project.id} className="overflow-hidden border-border">
        <div className="min-h-36 border-b border-navy bg-navy p-5 text-navy-foreground sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
              {project.sector}
            </p>
            <span className="rounded-full border border-white/30 px-2.5 py-1 text-xs font-medium">
              Approved public view
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{project.title}</h2>
        </div>
        <CardHeader>
          <CardTitle className="text-xl">{project.tagline}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-base leading-7 text-muted-foreground">{project.approvedSummary}</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Metric label="Area" value={project.area} />
            <Metric label="Progress" value={`${project.progressTrend.at(-1) ?? 0}%`} />
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/public/projects/${project.id}`}>
              View project story
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    ))}
  </div>
)

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="border-l-2 border-primary pl-3">
    <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold tabular-nums text-foreground">{value}</p>
  </div>
)
