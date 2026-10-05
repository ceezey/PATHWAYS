import { ArrowRight, ArrowUpRight, MapPin, ShieldCheck, Wrench } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { publicOrganizations } from '@/constants/navigation'
import type { PublicProjectSnapshot } from '@/lib/services/public-projects'
import { Reveal, ScrollProgress } from './public-motion'
import { Blend, Eyebrow, Footer, Glow, SectionHead, shell } from './public-sections'
import { PublicTrackerCards } from './public-tracker-view'

type Organization = (typeof publicOrganizations)[number]

const DarkHero = ({ eyebrow, children }: { eyebrow: string; children: ReactNode }) => (
  <section className="relative overflow-hidden bg-gradient-to-b from-navy via-blue-950 to-blue-950">
    <Glow className="-left-32 -top-24 h-96 w-96 bg-sky-400/25" />
    <Glow className="right-0 top-10 h-72 w-72 bg-teal-300/15" speed={0.3} />
    <div className={`${shell} space-y-6 pb-14 pt-20 sm:pt-28`}>
      <Reveal>
        <Eyebrow tone="text-sky-200">{eyebrow}</Eyebrow>
      </Reveal>
      {children}
    </div>
  </section>
)

const linkClass =
  'inline-flex items-center gap-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const OrganizationCard = ({ organization }: { organization: Organization }) => (
  <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-sky-900/10">
    <div className="relative overflow-hidden bg-gradient-to-br from-navy via-blue-950 to-sky-900 p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/20 blur-2xl transition-transform duration-700 group-hover:scale-125"
      />
      <h2 className="relative text-2xl leading-8 text-white sm:text-3xl">{organization.name}</h2>
      <p className="relative mt-2 flex items-center gap-1.5 text-sm text-sky-100/80">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        {organization.location}
      </p>
    </div>
    <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
      <p className="text-base leading-7 text-gray-600">{organization.summary}</p>
      <ul className="flex flex-wrap gap-2">
        {organization.focus.map((item) => (
          <li
            key={item}
            className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800"
          >
            {item}
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-sm text-gray-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
        {organization.credentials}
      </p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
        <Link
          className={`${linkClass} text-sky-700 hover:text-sky-900`}
          href={`/organizations/${organization.slug}`}
        >
          View published projects
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
        <a
          className={`${linkClass} text-gray-500 hover:text-gray-800`}
          href={organization.website}
          rel="noreferrer"
          target="_blank"
        >
          Official website
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </div>
  </article>
)

export const PublicOrganizationsPage = () => (
  <div className="overflow-x-clip bg-white">
    <ScrollProgress />
    <DarkHero eyebrow="Organizations">
      <Reveal delay={100} variant="scale">
        <h1 className="max-w-4xl text-4xl leading-tight text-slate-100 sm:text-6xl sm:leading-[1.08]">
          The organizations behind{' '}
          <span className="bg-gradient-to-r from-sky-300 to-teal-200 bg-clip-text text-transparent">
            every published project.
          </span>
        </h1>
      </Reveal>
      <Reveal delay={220}>
        <p className="max-w-3xl text-lg leading-8 text-slate-300">
          Each organization here publishes approved, non-sensitive project summaries through
          PATHWAYS. Choose one to see what it shares with the public.
        </p>
      </Reveal>
    </DarkHero>
    <Blend to="light" />
    <section className="relative">
      <Glow className="-right-40 top-0 h-96 w-96 bg-sky-200/50" speed={0.15} />
      <div className={`${shell} space-y-14 pb-20 pt-16 sm:pb-28 sm:pt-20`}>
        <ul className="grid gap-8 md:grid-cols-2">
          {publicOrganizations.map((organization, index) => (
            <li key={organization.slug}>
              <Reveal delay={index * 140} variant="scale" className="h-full">
                <OrganizationCard organization={organization} />
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
    <Blend to="dark" />
    <Footer page="Organizations" />
  </div>
)

export const PublicOrganizationPage = ({
  organization,
  projects,
}: {
  organization: Organization
  projects: PublicProjectSnapshot[] | null
}) => (
  <div className="overflow-x-clip bg-white">
    <ScrollProgress />
    <DarkHero eyebrow="Organization">
      <Reveal delay={100} variant="scale">
        <h1 className="max-w-4xl text-4xl leading-tight text-slate-100 sm:text-6xl sm:leading-[1.08]">
          {organization.name}
        </h1>
      </Reveal>
      <Reveal delay={180}>
        <p className="flex items-center gap-1.5 text-sm text-sky-100/80">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {organization.location}
        </p>
      </Reveal>
      <Reveal delay={240}>
        <p className="max-w-3xl text-lg leading-8 text-slate-300">{organization.summary}</p>
      </Reveal>
      <Reveal delay={320} className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {organization.focus.map((item) => (
          <span
            key={item}
            className="bg-gradient-to-r from-sky-200 to-teal-200 bg-clip-text text-xs font-bold uppercase tracking-[0.14em] text-transparent"
          >
            {item}
          </span>
        ))}
        <a
          className={`${linkClass} text-sky-100 hover:text-white`}
          href={organization.website}
          rel="noreferrer"
          target="_blank"
        >
          Official website
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Reveal>
    </DarkHero>
    <Blend to="light" />
    <section className="relative">
      <Glow className="-left-40 top-0 h-96 w-96 bg-sky-200/50" speed={0.15} />
      <div className={`${shell} space-y-12 pb-20 pt-16 sm:pb-28 sm:pt-20`}>
        <SectionHead
          eyebrow="Published projects"
          title="What this organization shares with the public."
          body="Each summary was reviewed and approved by a separate staff member before publication. Beneficiary-level records are never shown."
        />
        {projects ? (
          <Reveal delay={120}>
            <PublicTrackerCards projects={projects} />
          </Reveal>
        ) : (
          <Reveal className="flex items-start gap-3 text-base text-gray-600">
            <Wrench className="mt-1 h-5 w-5 shrink-0 text-yellow-700" aria-hidden="true" />
            Published projects are temporarily unavailable. Please try again later.
          </Reveal>
        )}
      </div>
    </section>
    <Blend to="dark" />
    <Footer page={organization.name} />
  </div>
)
