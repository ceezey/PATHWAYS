import { ArrowRight, BadgeCheck, HandHeart, MapPin, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { ProgressBar } from '@/components/pathways/progress-bar'
import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PublicProjectRecord } from '@/types/pathways'

import {
  PublicIndicatorChart,
  PublicPortfolioChart,
  PublicProgressTrendChart,
} from './public-project-charts'

const indicatorTone = (status: PublicProjectRecord['selectedIndicators'][number]['status']) =>
  status === 'Completed' ? 'success' : status === 'On Track' ? 'info' : 'warning'

export const PublicHomeDashboard = ({ projects }: { projects: PublicProjectRecord[] }) => (
  <main className="bg-slate-50">
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-5">
          <StatusBadge tone="success">Approved public project information</StatusBadge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              PATHWAYS Public Project Dashboard
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
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
            <Button asChild variant="outline">
              <Link href="/public/projects">Browse approved summaries</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-teal-700">Portfolio snapshot</p>
              <p className="text-sm text-slate-500">Selected indicator progress</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
          </div>
          <PublicPortfolioChart projects={projects} />
        </div>
      </div>
    </section>

    <section className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Public projects</h2>
          <p className="text-sm text-slate-600">
            Project cards show approved summaries and aggregate progress only.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/public/projects">Browse all</Link>
        </Button>
      </div>
      <PublicProjectCards projects={projects} />
    </section>
  </main>
)

export const PublicProjectsList = ({ projects }: { projects: PublicProjectRecord[] }) => (
  <main className="bg-slate-50">
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-6xl space-y-3 px-6 py-10">
        <p className="text-xs font-semibold uppercase text-teal-700">Public Programs Dashboard</p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Projects</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          These public project pages contain mock, approved, non-sensitive information for the Phase
          9 prototype.
        </p>
      </div>
    </section>
    <section className="mx-auto w-full max-w-6xl px-6 py-10">
      <PublicProjectCards projects={projects} />
    </section>
  </main>
)

export const PublicProjectDetail = ({ project }: { project: PublicProjectRecord }) => (
  <main className="bg-slate-50">
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link className="hover:text-slate-950" href="/">
            Home
          </Link>
          <span>/</span>
          <Link className="hover:text-slate-950" href="/public/projects">
            Public projects
          </Link>
          <span>/</span>
          <span className="text-slate-900">{project.title}</span>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="space-y-4">
            <StatusBadge tone="success">{project.publicationState}</StatusBadge>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                {project.title}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{project.tagline}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Progress" value={`${project.progressTrend.at(-1) ?? 0}%`} />
            <Metric
              label="Active beneficiaries"
              value={project.beneficiariesReached.toLocaleString()}
            />
            <Metric label="Assessment" value={project.assessmentSummary.split(' ')[0]} />
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto grid w-full max-w-6xl gap-5 px-6 py-8 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Approved summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
          <p>{project.approvedSummary}</p>
          <p>{project.description}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Project areas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.projectAreas.map((area) => (
            <div key={area} className="flex items-center gap-2 text-sm text-slate-700">
              <MapPin className="h-4 w-4 text-teal-700" aria-hidden="true" />
              {area}
            </div>
          ))}
          <p className="pt-2 text-xs text-slate-500">{project.timeframe}</p>
        </CardContent>
      </Card>
    </section>

    <section className="mx-auto grid w-full max-w-6xl gap-5 px-6 pb-8 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Progress trend</CardTitle>
        </CardHeader>
        <CardContent>
          <PublicProgressTrendChart project={project} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Selected indicators</CardTitle>
        </CardHeader>
        <CardContent>
          <PublicIndicatorChart project={project} />
        </CardContent>
      </Card>
    </section>

    <section className="mx-auto grid w-full max-w-6xl gap-5 px-6 pb-8 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle>Indicator details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.selectedIndicators.map((indicator) => (
            <div key={indicator.id} className="space-y-2 rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{indicator.label}</p>
                <StatusBadge tone={indicatorTone(indicator.status)}>{indicator.status}</StatusBadge>
              </div>
              <ProgressBar value={indicator.progress} tone="info" />
              <p className="text-xs text-slate-500">
                {indicator.actualLabel} of {indicator.targetLabel}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About the Project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-sm leading-6 text-slate-600">
          <p>{project.aboutProject}</p>
          <div>
            <h3 className="font-semibold text-slate-950">Milestones</h3>
            <div className="mt-3 space-y-3">
              {project.milestones.map((milestone) => (
                <div key={milestone.id} className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-teal-700" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-slate-900">{milestone.title}</p>
                    <p className="text-xs text-slate-500">
                      {milestone.dateLabel} - {milestone.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-slate-950">Accomplishments</h3>
            <ul className="mt-3 space-y-2">
              {project.accomplishments.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </section>

    <section id="engage" className="bg-teal-800 text-white">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-10 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Donate or Engage</h2>
          <p className="max-w-2xl text-sm leading-6 text-teal-50">
            This prototype button is a placeholder for the organization-approved external engagement
            destination.
          </p>
        </div>
        <Button asChild variant="secondary">
          {/* TODO(EXTERNAL): Connect engagement button to the organization-approved destination. */}
          <Link href="/public/projects">
            <HandHeart className="mr-2 h-4 w-4" aria-hidden="true" />
            Donate or Engage
          </Link>
        </Button>
      </div>
    </section>
  </main>
)

const PublicProjectCards = ({ projects }: { projects: PublicProjectRecord[] }) => (
  <div className="grid gap-5 md:grid-cols-2">
    {projects.map((project) => (
      <Card key={project.id} className="overflow-hidden">
        <div className="h-36 bg-[linear-gradient(135deg,#0f766e,#2563eb)] p-5 text-white">
          <p className="text-xs font-semibold uppercase opacity-80">{project.sector}</p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{project.title}</h2>
        </div>
        <CardHeader>
          <CardTitle className="text-xl">{project.tagline}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">{project.approvedSummary}</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Metric label="Area" value={project.area} />
            <Metric label="Progress" value={`${project.progressTrend.at(-1) ?? 0}%`} />
          </div>
          <Button asChild>
            <Link href={`/public/projects/${project.id}`}>
              Read more
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    ))}
  </div>
)

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-slate-200 bg-white p-3">
    <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
    <p className="mt-1 font-semibold text-slate-950">{value}</p>
  </div>
)
