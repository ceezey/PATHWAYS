import { Eye, Scale, ShieldCheck, UserCheck } from 'lucide-react'

import { ContactForm } from './public-contact-form'
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

const AboutHero = () => (
  <section className="relative overflow-hidden bg-gradient-to-b from-navy via-blue-950 to-blue-950">
    <Glow className="-left-32 -top-24 h-96 w-96 bg-sky-400/25" />
    <Glow className="right-0 top-10 h-72 w-72 bg-teal-300/15" speed={0.3} />
    <div className={`${shell} space-y-6 pb-12 pt-20 sm:pt-28`}>
      <Reveal>
        <Eyebrow tone="text-sky-200">About us</Eyebrow>
      </Reveal>
      <Reveal delay={100} variant="scale">
        <h1 className="max-w-4xl text-4xl leading-tight text-slate-100 sm:text-6xl sm:leading-[1.08]">
          Clearer project information for the people who{' '}
          <span className="bg-gradient-to-r from-sky-300 to-teal-200 bg-clip-text text-transparent">
            serve communities.
          </span>
        </h1>
      </Reveal>
      <Reveal delay={220}>
        <p className="max-w-3xl text-lg leading-8 text-slate-300">
          PATHWAYS is a project information management and decision support platform for
          humanitarian and development organizations. It connects field data, project records, and
          evidence so teams can see what is happening and why, while people, not software, stay
          responsible for the decisions that matter.
        </p>
      </Reveal>
    </div>
  </section>
)

const Story = () => (
  <section className="relative">
    <Glow className="-right-40 top-0 h-96 w-96 bg-sky-200/50" speed={0.15} />
    <div
      className={`${shell} grid gap-10 pb-20 pt-16 sm:pb-28 sm:pt-20 lg:grid-cols-2 lg:items-center`}
    >
      <SectionHead eyebrow="Why PATHWAYS" title="Good intentions need good information." />
      <Reveal delay={120} className="space-y-5 text-lg leading-8 text-gray-600">
        <p>
          Development teams collect a great deal of data, yet the context behind a figure, where it
          came from, who reviewed it, and what it means, is often lost between tools and reporting
          cycles.
        </p>
        <p>
          PATHWAYS was created to keep that context intact from the field to the final report, so
          that every decision and every published number can be traced, explained, and trusted.
        </p>
      </Reveal>
    </div>
  </section>
)

const principles = [
  [
    UserCheck,
    'People decide, systems support',
    'Recommendations are offered as advice. Consequential decisions are made, recorded, and attributed by authorized people.',
  ],
  [
    ShieldCheck,
    'Privacy is structural',
    'Access is scoped by role and project from the start, not added at the end.',
  ],
  [
    Eye,
    'Transparency is deliberate',
    'Only approved, aggregate information reaches the public, always with clear provenance.',
  ],
  [
    Scale,
    'Uncertainty stays honest',
    'Data quality, review status, and gaps stay visible instead of being smoothed over.',
  ],
] as const

const Principles = () => (
  <section className="relative">
    <div className={`${shell} space-y-14 pb-20 sm:pb-28`}>
      <SectionHead eyebrow="What we believe" title="Principles that shape every feature." />
      <ul className="grid gap-x-16 gap-y-12 sm:grid-cols-2">
        {principles.map(([Icon, title, body], index) => (
          <li key={title}>
            <Reveal delay={(index % 2) * 120} className="group flex gap-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-400 text-white shadow-lg shadow-sky-500/20 transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-3">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h3 className="text-xl leading-7 text-neutral-900">{title}</h3>
                <p className="text-base leading-7 text-gray-500">{body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  </section>
)

const Contact = () => (
  <section id="contact" className="relative scroll-mt-24">
    <Glow className="-left-40 top-1/4 h-96 w-96 bg-teal-100/70" speed={0.2} />
    <div className={`${shell} grid gap-14 py-20 sm:py-28 lg:grid-cols-[0.85fr_1.15fr]`}>
      <div className="space-y-8">
        <SectionHead
          eyebrow="Contact us"
          title="Let's talk about your projects."
          body="Whether you are exploring a pilot, a research collaboration, or an implementation partnership, we would like to hear about your context, your safeguards, and where project information breaks down in your work."
        />
        <Reveal delay={200} className="flex gap-3 text-sm leading-6 text-gray-500">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
          Share operational needs, not sensitive records. Early conversations never require
          beneficiary data or private project records.
        </Reveal>
      </div>
      <Reveal delay={150} variant="scale">
        <ContactForm />
      </Reveal>
    </div>
  </section>
)

export const PublicAboutPage = () => (
  <div className="overflow-x-clip bg-white">
    <ScrollProgress />
    <AboutHero />
    <Blend to="light" />
    <Story />
    <Principles />
    <Blend to="dark" />
    <DarkRun>
      <Mission />
    </DarkRun>
    <Blend to="light" />
    <Audiences />
    <Contact />
    <Blend to="dark" />
    <Footer page="About Us" />
  </div>
)
