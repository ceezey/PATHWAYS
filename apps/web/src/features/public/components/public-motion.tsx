'use client'

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'

// Scroll-driven motion for the public pages; every effect settles to its final state under reduced motion.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const onScrollFrame = (update: () => void) => {
  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }
  update()
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }
}

const hidden = {
  rise: 'motion-safe:translate-y-10 motion-safe:opacity-0 motion-safe:blur-[6px]',
  scale:
    'motion-safe:translate-y-6 motion-safe:scale-[0.96] motion-safe:opacity-0 motion-safe:blur-[6px]',
  left: 'motion-safe:-translate-x-10 motion-safe:opacity-0 motion-safe:blur-[6px]',
} as const

export const Reveal = ({
  children,
  className = '',
  delay = 0,
  variant = 'rise',
}: {
  children: ReactNode
  className?: string
  delay?: number
  variant?: keyof typeof hidden
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setShown(true)
        observer.disconnect()
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`motion-safe:transition-[opacity,transform,filter] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] ${shown ? 'translate-x-0 translate-y-0 scale-100 opacity-100 blur-0' : hidden[variant]} ${className}`}
    >
      {children}
    </div>
  )
}

export const ParallaxGlow = ({
  className,
  speed = 0.25,
}: { className: string; speed?: number }) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reducedMotion()) return
    return onScrollFrame(() => {
      const node = ref.current
      if (!node) return
      const box = node.getBoundingClientRect()
      const offset = (box.top + box.height / 2 - window.innerHeight / 2) * speed
      node.style.translate = `0 ${Math.round(Math.max(-80, Math.min(80, -offset)))}px`
    })
  }, [speed])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full blur-3xl will-change-[translate] ${className}`}
    />
  )
}

// Words brighten one after another as the passage scrolls through the viewport.
export const ScrollHighlight = ({ text, className }: { text: string; className: string }) => {
  const ref = useRef<HTMLParagraphElement>(null)
  const words = text.split(' ')

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reducedMotion()) return node.style.setProperty('--p', '1')
    return onScrollFrame(() => {
      const box = node.getBoundingClientRect()
      const start = window.innerHeight * 0.85
      const progress = (start - box.top) / (box.height + window.innerHeight * 0.35)
      node.style.setProperty('--p', String(Math.min(Math.max(progress, 0), 1)))
    })
  }, [])

  return (
    <p ref={ref} className={className} style={{ '--p': 0 } as CSSProperties}>
      {words.map((word, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: words repeat and their order never changes.
          key={index}
          className="transition-opacity duration-200"
          style={{ opacity: `clamp(0.18, calc(var(--p) * ${words.length + 4} - ${index}), 1)` }}
        >
          {word}{' '}
        </span>
      ))}
    </p>
  )
}

export const ScrollProgress = () => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      onScrollFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (ref.current)
          ref.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`
      }),
    [],
  )

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-sky-400 via-teal-300 to-sky-300"
    />
  )
}
