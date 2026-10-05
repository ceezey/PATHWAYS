import {
  ArrowRight,
  Check,
  FileCheck2,
  Globe2,
  LineChart,
  Network,
  ShieldCheck,
  UploadCloud,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'

import { publicContactHref } from '@/constants/navigation'
import { HeroJourney } from './public-journey'
import { Reveal, ScrollProgress } from './public-motion'
import {
  Audiences,
  Blend,
  DarkRun,
  Eyebrow,
  Footer,
  Glow,
  Mission,
  SectionHead,
  shell,
} from './public-sections'

const heroPoints = [
  'Privacy and access controls built into the structure',
  'Every figure traceable from the field to the approved report',
  'Consequential decisions stay with authorized people',
]

const Hero = () => (
  <HeroJourney>
    <div className="space-y-6">
      <Reveal>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sky-100/90">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-300" aria-hidden="true" />
          Approved for public release. Beneficiary-level records are never published.
        </p>
      </Reveal>
      <Reveal delay={80}>
        <Eyebrow tone="text-sky-200">Project information management · Decision support</Eyebrow>
      </Reveal>
      <Reveal delay={160} variant="scale">
        <h1 className="text-4xl leading-tight text-slate-100 sm:text-5xl sm:leading-[1.12]">
          A clearer path to{' '}
          <span className="bg-gradient-to-r from-sky-300 to-teal-200 bg-clip-text text-transparent">
            meaningful change.
          </span>
        </h1>
      </Reveal>
      <Reveal delay={260}>
        <p className="max-w-2xl text-lg leading-8 text-slate-300">
          PATHWAYS connects field data, project records, and beneficiary journeys so humanitarian
          and development teams can see progress, review evidence, and understand what needs
          attention. Monitoring dashboards and rule-based guidance help teams make informed
          decisions and identify their next steps. Authorized personnel remain in control of
          decisions, while only reviewed, approved, and non-sensitive project information is shared
          publicly.
        </p>
      </Reveal>
      <ul className="space-y-2">
        {heroPoints.map((point, index) => (
          <li key={point}>
            <Reveal delay={340 + index * 80} variant="left" className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
              <span className="text-sm text-sky-100">{point}</span>
            </Reveal>
          </li>
        ))}
      </ul>
      <Reveal delay={600}>
        <p className="text-xs text-slate-400">
          Built to support human judgment, never to replace it.
        </p>
      </Reveal>
    </div>
  </HeroJourney>
)

const challenges = [
  [
    'Disconnected records',
    'Activities, indicators, evidence, and results sit apart, so the story behind a number is hard to see.',
  ],
  [
    'Manual reconciliation',
    'The same checks are repeated and the same reports rebuilt across spreadsheets and systems.',
  ],
  [
    'Limited shared context',
    'Decision-makers receive figures without their source, review status, or history.',
  ],
]

const Challenge = () => (
  <section className="relative">
    <Glow className="-left-40 top-0 h-96 w-96 bg-sky-200/50" speed={0.15} />
    <div className={`${shell} space-y-14 pb-20 pt-16 sm:pb-28 sm:pt-20`}>
      <SectionHead
        eyebrow="The challenge"
        title="Project information is scattered. Context gets lost along the way."
        body="Plans, field data, indicators, evidence, and beneficiary records often live in separate tools. Teams spend each reporting cycle rebuilding context instead of acting on it."
      />
      <ol className="grid gap-12 md:grid-cols-3 md:gap-10">
        {challenges.map(([title, body], index) => (
          <li key={title}>
            <Reveal delay={index * 140} className="space-y-3">
              <p className="bg-gradient-to-br from-sky-600 to-teal-400 bg-clip-text font-heading text-5xl text-transparent">
                0{index + 1}
              </p>
              <h3 className="text-2xl leading-8 text-neutral-900">{title}</h3>
              <p className="text-base leading-7 text-gray-500">{body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  </section>
)

const safeguards = [
  ['Minimum necessary access', 'People see only what their role and project scope allow.'],
  [
    'Separate approval to publish',
    'Nothing goes public without explicit approval and clear provenance.',
  ],
  [
    'Aggregate public reporting',
    'Public views show approved, high-level information and hold back sensitive detail.',
  ],
  [
    'Traceable handling',
    'Validation, review, and publication states stay clear to authorized teams.',
  ],
]

const Privacy = () => (
  <section id="privacy" className="relative scroll-mt-24">
    <Glow className="-right-24 top-1/3 h-96 w-96 bg-sky-500/15" speed={0.35} />
    <div className={`${shell} space-y-14 pb-24 pt-8 sm:pb-32`}>
      <SectionHead
        dark
        eyebrow="Privacy by design"
        title="Sensitive information stays governed, scoped, and private by default."
        body="PATHWAYS is built for work where information affects real people. Access follows each person's role and project scope. Beneficiary details, private evidence, internal alerts, and review notes never become public just because they exist in the system."
      />
      <ul className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
        {safeguards.map(([title, body], index) => (
          <li key={title}>
            <Reveal delay={(index % 2) * 120} className="flex gap-4">
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-teal-300 text-blue-950">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="space-y-1.5">
                <h3 className="text-xl leading-7 text-slate-100">{title}</h3>
                <p className="text-base leading-7 text-slate-300">{body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
      <Reveal variant="scale">
        <p className="max-w-3xl bg-gradient-to-r from-sky-200 to-teal-200 bg-clip-text font-heading text-2xl leading-9 text-transparent sm:text-3xl sm:leading-[1.3]">
          Privacy is not a setting added at the end. It shapes how information is collected,
          reviewed, shared, and published.
        </p>
      </Reveal>
    </div>
  </section>
)

const capabilities = [
  [
    Globe2,
    'Approved public transparency',
    'Publish selected, aggregate project information without exposing private records or internal remarks.',
  ],
  [
    FileCheck2,
    'Evidence and traceability',
    'Link every record to its origin, validation status, supporting evidence, and approved use.',
  ],
  [
    UsersRound,
    'Beneficiary-aware records',
    'Manage beneficiary information with explicit permissions and privacy controls.',
  ],
  [
    LineChart,
    'Monitoring and decision support',
    'Follow implementation, flag conditions that need review, and offer recommendations as advice, not instructions.',
  ],
  [
    UploadCloud,
    'Field data preparation',
    'Import datasets, review mappings, and resolve fields that need human attention before anything is applied.',
  ],
  [
    Network,
    'Structured project information',
    'Organize projects, activities, indicators, budgets, and related records with their context in view.',
  ],
] as const

const Capabilities = () => (
  <section className="relative">
    <Glow className="-left-40 top-1/3 h-96 w-96 bg-teal-100/60" speed={0.2} />
    <div className={`${shell} space-y-14 pb-20 pt-16 sm:pb-28 sm:pt-20`}>
      <SectionHead
        eyebrow="What PATHWAYS supports"
        title="One connected environment for the whole project information lifecycle."
      />
      <ul className="grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map(([Icon, title, body], index) => (
          <li key={title}>
            <Reveal delay={(index % 3) * 120} className="group space-y-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-400 text-white shadow-lg shadow-sky-500/20 transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-3">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-xl leading-7 text-neutral-900">{title}</h3>
              <p className="text-base leading-7 text-gray-500">{body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  </section>
)

const Partner = () => (
  <section className="relative">
    <Glow className="left-1/2 top-10 h-80 w-[36rem] -translate-x-1/2 bg-sky-200/60" speed={0.1} />
    <div className={`${shell} flex flex-col items-center space-y-8 py-20 text-center sm:py-28`}>
      <Reveal variant="scale">
        <Eyebrow>Partner with us</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-4xl text-3xl leading-tight text-neutral-900 sm:text-5xl sm:leading-[1.1]">
          Explore a pilot, a research collaboration, or an implementation partnership.
        </h2>
      </Reveal>
      <Reveal delay={120}>
        <p className="mx-auto max-w-3xl text-lg leading-8 text-gray-500">
          We welcome conversations with humanitarian and development organizations, local partners,
          funders, researchers, data-responsibility specialists, and public-interest institutions.
        </p>
      </Reveal>
      <Reveal delay={220}>
        <Link
          className="group inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-navy to-sky-700 px-7 text-sm font-semibold text-white shadow-lg shadow-sky-900/20 transition-shadow hover:shadow-xl hover:shadow-sky-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href={publicContactHref}
        >
          Start a conversation
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
        <p className="mt-4 text-sm text-gray-500">
          Early conversations never require beneficiary data or private project records.
        </p>
      </Reveal>
    </div>
  </section>
)

export const PublicLandingPage = () => (
  <div className="overflow-x-clip bg-white">
    <ScrollProgress />
    <Hero />
    <Blend to="light" />
    <Challenge />
    <Blend to="dark" />
    <DarkRun>
      <Mission />
      <Privacy />
    </DarkRun>
    <Blend to="light" />
    <Capabilities />
    <Audiences />
    <Partner />
    <Blend to="dark" />
    <Footer page="Home" />
  </div>
)
