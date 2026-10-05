'use client'

import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { publicOrganizations } from '@/constants/navigation'

import { journeyStepId, journeySteps } from './public-journey-content'
import { Glow, shell } from './public-sections'

// Intro copy on top, then a scroll-driven walkthrough: the step nearest the viewport centre drives the sticky preview.
export const HeroJourney = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step))
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const node of refs.current) if (node) observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const select = (index: number) => {
    setActive(index)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    refs.current[index]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' })
  }

  const progress = ((active + 1) / journeySteps.length) * 100

  return (
    <section className="relative overflow-clip bg-gradient-to-b from-navy via-blue-950 to-blue-950">
      <Glow className="-left-32 -top-32 h-96 w-96 bg-sky-400/25" />
      <Glow className="right-0 top-1/3 h-[28rem] w-[28rem] bg-teal-300/10" />
      <div className={`${shell} pb-16 pt-20 sm:pb-20 sm:pt-28`}>
        <div className="max-w-4xl">{children}</div>
      </div>

      <div id="how-it-works" className={`${shell} scroll-mt-24 pb-16 sm:pb-24`}>
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300">
            An accountable information pathway
          </p>
          <span className="shrink-0 rounded-full border border-sky-200/40 px-2.5 py-1 text-[10px] font-bold text-sky-100">
            Human-reviewed
          </span>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <div className="relative">
            <div aria-hidden="true" className="absolute bottom-0 left-5 top-0 w-0.5 bg-white/15">
              <div
                className="w-full bg-gradient-to-b from-sky-400 to-teal-300 motion-safe:transition-[height] motion-safe:duration-500"
                style={{ height: `${progress}%` }}
              />
            </div>
            <ol>
              {journeySteps.map((step, index) => {
                const current = index === active
                const Icon = step.icon
                return (
                  <li
                    key={step.label}
                    id={journeyStepId(index)}
                    data-step={index}
                    ref={(node) => {
                      refs.current[index] = node
                    }}
                    aria-current={current ? 'step' : undefined}
                    className="relative scroll-mt-28 pb-12 pl-16 last:pb-0 lg:flex lg:min-h-[70vh] lg:flex-col lg:justify-center lg:pb-0"
                  >
                    <button
                      type="button"
                      aria-label={`Step ${index + 1}: ${step.label}`}
                      onClick={() => select(index)}
                      className={`absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-all motion-safe:duration-300 lg:top-1/2 lg:-translate-y-1/2 ${current ? 'scale-110 border-transparent bg-gradient-to-br from-sky-400 to-teal-400 text-blue-950 shadow-lg shadow-sky-400/30' : index < active ? 'border-sky-400 bg-blue-950 text-sky-300' : 'border-white/25 bg-blue-950 text-sky-100/60'}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div
                      className={`space-y-3 motion-safe:transition-opacity motion-safe:duration-300 ${current ? 'opacity-100' : 'lg:opacity-40'}`}
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-200">
                        Step {index + 1} · {step.status}
                      </p>
                      <h3 className="text-2xl leading-8 text-slate-100 sm:text-3xl">
                        {step.title}
                      </h3>
                      <p className="text-base leading-7 text-slate-300">{step.body}</p>
                      <ul className="space-y-1.5">
                        {step.points.map((point) => (
                          <li key={point} className="flex items-center gap-2 text-sm text-sky-100">
                            <Check className="h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
                            {point}
                          </li>
                        ))}
                      </ul>
                      <div className="pt-3 lg:hidden">
                        <step.Visual />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-28 flex h-[calc(100vh-9rem)] flex-col justify-center gap-6">
              <div className="flex items-center gap-2" aria-hidden="true">
                {journeySteps.map((step, index) => (
                  <span
                    key={step.label}
                    className={`h-1.5 flex-1 rounded-full motion-safe:transition-colors motion-safe:duration-300 ${index <= active ? 'bg-gradient-to-r from-sky-400 to-teal-300' : 'bg-white/15'}`}
                  />
                ))}
              </div>
              <div className="relative min-h-[23rem] overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur">
                {journeySteps.map((step, index) => (
                  <div
                    key={step.label}
                    aria-hidden={index !== active}
                    className={`absolute inset-8 flex items-center motion-safe:transition-all motion-safe:duration-500 ${index === active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'}`}
                  >
                    <step.Visual />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 text-sm text-sky-100/80">
                <span>
                  {journeySteps[active].label}: {journeySteps[active].summary}
                </span>
                <Link
                  className="flex shrink-0 items-center gap-1 font-semibold text-sky-100 hover:text-white"
                  href={`/organizations/${publicOrganizations[0].slug}`}
                >
                  Published projects
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
