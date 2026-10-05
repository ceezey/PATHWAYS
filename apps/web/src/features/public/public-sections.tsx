import Link from 'next/link'
import type { ReactNode } from 'react'

import { organizationsHref, publicContactHref } from '@/constants/navigation'
import { ParallaxGlow, Reveal, ScrollHighlight } from './public-motion'

// Shared building blocks for the public pages; headings use the brand font, body text the UI font.
export const shell = 'relative mx-auto w-full max-w-6xl px-4 sm:px-6'

// One clipped dark surface behind consecutive dark sections, so their glows never meet a hard edge.
export const DarkRun = ({ children }: { children: ReactNode }) => (
  <div className="relative overflow-hidden bg-blue-950">{children}</div>
)

export const Glow = ParallaxGlow

export const Eyebrow = ({
  children,
  tone = 'text-sky-700',
}: { children: string; tone?: string }) => (
  <p className={`text-xs font-bold uppercase tracking-[0.14em] ${tone}`}>{children}</p>
)

export const SectionHead = ({
  eyebrow,
  title,
  body,
  dark = false,
}: { eyebrow: string; title: string; body?: string; dark?: boolean }) => (
  <div className="max-w-3xl space-y-4">
    <Reveal variant="scale">
      <Eyebrow tone={dark ? 'text-sky-200' : 'text-sky-700'}>{eyebrow}</Eyebrow>
      <h2
        className={`mt-4 text-3xl leading-tight sm:text-5xl sm:leading-[1.1] ${dark ? 'text-slate-100' : 'text-neutral-900'}`}
      >
        {title}
      </h2>
    </Reveal>
    {body ? (
      <Reveal delay={120}>
        <p className={`text-lg leading-8 ${dark ? 'text-slate-300' : 'text-gray-500'}`}>{body}</p>
      </Reveal>
    ) : null}
  </div>
)

// A layered wave with hard edges that carries one surface into the next.
const backWave = 'M0,44 C260,104 520,4 780,36 C1040,68 1240,108 1440,52 L1440,120 L0,120 Z'
const frontWave = 'M0,72 C240,116 500,28 740,56 C980,84 1220,120 1440,80 L1440,120 L0,120 Z'

export const Blend = ({ to }: { to: 'dark' | 'light' }) => (
  <div aria-hidden="true" className={`-mb-px ${to === 'dark' ? 'bg-white' : 'bg-blue-950'}`}>
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={`block h-16 w-full sm:h-28 ${to === 'dark' ? '-scale-x-100' : ''}`}
    >
      <path d={backWave} className="fill-navy" />
      <path d={frontWave} className={to === 'dark' ? 'fill-blue-950' : 'fill-white'} />
    </svg>
  </div>
)

const values = ['Connected', 'Understandable', 'Traceable', 'Actionable', 'Safe to work with']

export const Mission = () => (
  <section id="mission" className="relative scroll-mt-24">
    <Glow className="-left-24 top-1/4 h-80 w-80 bg-sky-500/20" />
    <Glow className="right-0 top-1/3 h-96 w-96 bg-teal-400/10" speed={0.4} />
    <div className={`${shell} space-y-10 py-20 sm:py-28`}>
      <Reveal>
        <Eyebrow tone="text-sky-200">Our mission</Eyebrow>
      </Reveal>
      <ScrollHighlight
        className="max-w-4xl font-heading text-3xl leading-tight text-slate-100 sm:text-5xl sm:leading-[1.15]"
        text="Make projects easier to understand, without making them any less carefully managed."
      />
      <Reveal delay={100}>
        <p className="max-w-3xl text-lg leading-8 text-slate-300">
          PATHWAYS helps humanitarian and development organizations turn connected project
          information into safer, clearer, and more timely decisions. Good systems make
          relationships visible, keep uncertainty honest, and make the next responsible action easy
          to see.
        </p>
      </Reveal>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {values.map((value, index) => (
          <li key={value}>
            <Reveal delay={index * 90} className="flex items-center gap-6">
              {index > 0 ? (
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-teal-300/70" />
              ) : null}
              <span className="bg-gradient-to-r from-sky-200 to-teal-200 bg-clip-text text-sm font-bold uppercase tracking-[0.14em] text-transparent">
                {value}
              </span>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  </section>
)

const audiences = [
  [
    'Human development organizations',
    'Program, monitoring, field, grants, and management teams work from the same connected information, each with access that fits their role.',
  ],
  [
    'Partners and funders',
    'Review approved progress and evidence with clear context, provenance, and continuity from one report to the next.',
  ],
  [
    'Communities and beneficiaries',
    'Benefit from careful handling of personal information and a firm line between operational records and public reporting.',
  ],
  [
    'Public-interest stakeholders',
    'Follow approved, aggregate project information built for transparency, never for access to sensitive records.',
  ],
]

export const Audiences = () => (
  <section className="relative">
    <Glow className="-right-40 top-20 h-96 w-96 bg-sky-200/50" speed={0.15} />
    <div className={`${shell} space-y-14 py-20 sm:py-28`}>
      <SectionHead
        eyebrow="Who it is for"
        title="Shared clarity for everyone around a project."
        body="Different people need different views of the same work. PATHWAYS gives each of them the right one."
      />
      <ul className="grid gap-x-16 gap-y-12 md:grid-cols-2">
        {audiences.map(([title, body], index) => (
          <li key={title}>
            <Reveal delay={(index % 2) * 120} variant="left" className="space-y-3">
              <span className="block h-px w-16 bg-gradient-to-r from-sky-600 to-teal-400" />
              <h3 className="text-2xl leading-8 text-neutral-900">{title}</h3>
              <p className="text-base leading-7 text-gray-500">{body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  </section>
)

const footerLinks = [
  ['Home', '/'],
  ['Organizations', organizationsHref],
  ['About Us', '/about'],
  ['Privacy', '/#privacy'],
  ['Contact', publicContactHref],
]

export const Footer = ({ page }: { page: string }) => (
  <footer className="bg-blue-950">
    <div className={`${shell} space-y-10 pb-12 pt-12`}>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md space-y-3">
          <p className="font-heading text-4xl text-white">pathways</p>
          <p className="text-base leading-7 text-slate-300">
            Project information management and decision support for humanitarian and development
            organizations.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-6">
          {footerLinks.map(([label, href]) => (
            <Link
              key={label}
              className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
              href={href}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex flex-col gap-2 border-t border-white/10 pt-6 sm:flex-row sm:justify-between">
        <p className="text-sm text-slate-400">
          Human judgment remains central. Public information is approval-controlled.
        </p>
        <p className="text-xs text-slate-500">PATHWAYS · {page}</p>
      </div>
    </div>
  </footer>
)
