'use client'

import { ArrowRight, Check, Mouse } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { publicOrganizations } from '@/constants/navigation'

import { journeySteps } from './public-journey-content'
import { Glow, shell } from './public-sections'

const wideQuery = '(min-width: 1024px)'
const count = journeySteps.length

// On wide screens the hero pins while scrolling through it advances the steps; elsewhere steps are tapped.
export const HeroJourney = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState(0)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const wide = window.matchMedia(wideQuery)
    let frame = 0
    const update = () => {
      frame = 0
      const node = sectionRef.current
      if (!node || !wide.matches) return
      const { top, height } = node.getBoundingClientRect()
      const span = height - window.innerHeight
      if (span <= 0) return
      const progress = Math.min(Math.max(-top / span, 0), 0.999)
      setActive(Math.floor(progress * count))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  const select = (index: number) => {
    const node = sectionRef.current
    if (!node || !window.matchMedia(wideQuery).matches) return setActive(index)
    const top = node.getBoundingClientRect().top + window.scrollY
    const span = node.offsetHeight - window.innerHeight
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({
      top: top + (span * (index + 0.5)) / count,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }

  return (
    <section ref={sectionRef} className="relative bg-blue-950 lg:h-[260vh]">
      <div className="relative overflow-hidden bg-gradient-to-b from-navy via-blue-950 to-blue-950 lg:sticky lg:top-[69px] lg:flex lg:h-[calc(100dvh-69px)] lg:items-center">
        <Glow className="-left-32 -top-32 h-96 w-96 bg-sky-400/25" />
        <Glow className="right-0 top-1/3 h-[28rem] w-[28rem] bg-teal-300/10" />
        <div
          className={`${shell} grid gap-10 py-14 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-6`}
        >
          {children}
          <JourneyTimeline active={active} onSelect={select} />
        </div>
      </div>
    </section>
  )
}

const JourneyTimeline = ({
  active,
  onSelect,
}: { active: number; onSelect: (index: number) => void }) => (
  <div>
    <div className="flex items-center justify-between gap-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300">
        An accountable information pathway
      </p>
      <span className="shrink-0 rounded-full border border-sky-200/40 px-2.5 py-1 text-[10px] font-bold text-sky-100">
        Human-reviewed
      </span>
    </div>

    <ol className="mt-5">
      {journeySteps.map((step, index) => {
        const current = index === active
        const done = index < active
        return (
          <li
            key={step.label}
            aria-current={current ? 'step' : undefined}
            className="relative pb-3 pl-12 last:pb-0"
          >
            {index < count - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute bottom-0 left-[15px] top-8 w-0.5 motion-safe:transition-colors motion-safe:duration-500 ${done ? 'bg-gradient-to-b from-sky-400 to-teal-300' : 'bg-white/15'}`}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-xs font-bold motion-safe:transition-all motion-safe:duration-300 ${current ? 'bg-gradient-to-br from-sky-400 to-teal-400 text-blue-950 shadow-lg shadow-sky-400/30' : done ? 'border-2 border-sky-400 text-sky-300' : 'border-2 border-white/25 text-sky-100/60'}`}
            >
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <button
              type="button"
              aria-expanded={current}
              aria-label={`Step ${index + 1}: ${step.label}`}
              className="flex min-h-8 w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelect(index)}
            >
              {current ? (
                <h3 className="text-xl leading-7 text-slate-100">{step.title}</h3>
              ) : (
                <span
                  className={`text-sm font-semibold ${done ? 'text-sky-100/80' : 'text-sky-100/60 hover:text-sky-100'}`}
                >
                  {step.label}
                </span>
              )}
              <span
                className={`shrink-0 text-[11px] font-bold uppercase tracking-wide ${current ? 'text-teal-200' : 'text-sky-100/40'}`}
              >
                {step.status}
              </span>
            </button>
            <div
              aria-hidden={!current}
              className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-500 ${current ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className={`min-h-0 overflow-hidden ${current ? '' : 'invisible'}`}>
                <p className="pt-1 text-sm leading-6 text-slate-300">{step.body}</p>
                <div className="pb-2 pt-3">
                  <step.Visual />
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ol>

    <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-sky-100/80">
      <span className="flex items-center gap-1.5">
        <Mouse className="hidden h-3.5 w-3.5 lg:block" aria-hidden="true" />
        <span className="hidden lg:inline">Scroll to walk through each step</span>
        <span className="lg:hidden">Tap a step to explore</span>
        <span className="tabular-nums text-sky-100/60">
          · {active + 1}/{count}
        </span>
      </span>
      <Link
        className="flex items-center gap-1 font-semibold text-sky-100 hover:text-white"
        href={`/organizations/${publicOrganizations[0].slug}`}
      >
        Published projects
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  </div>
)
