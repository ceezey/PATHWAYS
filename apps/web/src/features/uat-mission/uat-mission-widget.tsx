'use client'

// Evaluation-only points tracker: renders only for a participant who arrived from the UAT start link with ?mission=.
import { Check } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ProgressBar, SidePanel, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

// The UAT start link; a local copy can stand in for it while testing.
const START = process.env.NEXT_PUBLIC_UAT_MISSION_URL ?? 'https://pathways-uat.vercel.app'
const SERVICE = `${START}/api/progress`
const KEY = 'pathways-uat-mission'
const POLL_MS = 8000
const FORM_DELAY_S = 15

type Step = { id: string; title: string; hint: string; points: number; auto: boolean }
type Ask = { id: string; step: string; at: string }
type View = { steps: Step[]; ask: Ask[]; label: string; formUrl: string; paused: boolean }
export type Mission = {
  pid: string
  role: string
  account: string | null
  env: string
  startedAt: number
  current: string
  currentSince?: number
  credited: Record<string, string>
  claims: string[]
  declined: string[]
}

/** Reads the mission the start link put in the address; anything malformed is ignored. */
export const readMission = (search: string): Mission | null => {
  try {
    const raw = new URLSearchParams(search).get('mission')
    if (!raw) return null
    const m = JSON.parse(atob(raw)) as Partial<Mission>
    if (
      typeof m.pid !== 'string' ||
      typeof m.role !== 'string' ||
      typeof m.env !== 'string' ||
      typeof m.startedAt !== 'number'
    )
      return null
    return {
      pid: m.pid,
      role: m.role,
      account: m.account ?? null,
      env: m.env,
      startedAt: m.startedAt,
      current: '',
      credited: {},
      claims: [],
      declined: [],
    }
  } catch {
    return null
  }
}

const load = (): Mission | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Mission | null
  } catch {
    return null
  }
}
const store = (m: Mission | null) => {
  try {
    if (m) localStorage.setItem(KEY, JSON.stringify(m))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage can be blocked; the mission then lasts only for this page.
  }
}
const firstOpen = (steps: Step[], credited: Record<string, string>) =>
  steps.find((s) => !credited[s.id])?.id ?? ''

export const UatMissionWidget = () => {
  const [mission, setMission] = useState<Mission | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [open, setOpen] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const latest = useRef<Mission | null>(null)
  latest.current = mission

  useEffect(() => {
    const arrived = readMission(window.location.search)
    if (arrived) {
      const url = new URL(window.location.href)
      url.searchParams.delete('mission')
      window.history.replaceState(null, '', url)
    }
    const m = arrived ?? load()
    if (m) setMission(m)
  }, [])

  useEffect(() => store(mission), [mission])

  const steps = view?.steps ?? []
  const done = steps.length > 0 && steps.every((s) => mission?.credited[s.id])

  const credit = useCallback((id: string, value: string) => {
    setMission((m) => {
      if (!m || m.credited[id]) return m
      const credited = { ...m.credited, [id]: value }
      return { ...m, credited, current: m.current === id || !m.current ? '' : m.current }
    })
  }, [])

  // Changes when the participant picks a step or answers a question, so the next check runs at once.
  const pollKey = mission
    ? `${mission.pid}|${mission.current}|${mission.claims.length}|${mission.declined.length}`
    : ''

  useEffect(() => {
    if (!pollKey || done) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const m = latest.current
      if (!m) return
      try {
        const r = await fetch(SERVICE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(m),
        })
        const d = (await r.json()) as Partial<View> & {
          credited?: Record<string, string>
          startedAt?: number
          currentSince?: number
        }
        if (!r.ok || !d.steps) throw new Error('mission service')
        const fresh = Object.entries(d.credited ?? {}).filter(
          ([id]) => !latest.current?.credited[id],
        )
        for (const [id] of fresh) {
          const s = d.steps.find((x) => x.id === id)
          if (s) toast.success(`+${s.points} points`, { description: s.title })
        }
        setView({
          steps: d.steps,
          ask: d.ask ?? [],
          label: d.label ?? '',
          formUrl: d.formUrl ?? START,
          paused: Boolean(d.paused),
        })
        setMission((cur) => {
          if (!cur) return cur
          const credited = { ...cur.credited, ...d.credited }
          const current =
            cur.current && !credited[cur.current] ? cur.current : firstOpen(d.steps ?? [], credited)
          return {
            ...cur,
            credited,
            current,
            startedAt: d.startedAt ?? cur.startedAt,
            currentSince: d.currentSince ?? cur.currentSince,
          }
        })
      } catch {
        setView((v) => (v ? { ...v, paused: true } : v))
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [pollKey, done])

  useEffect(() => {
    if (!done) return
    setOpen(true)
    setCountdown(FORM_DELAY_S)
  }, [done])

  useEffect(() => {
    if (countdown === null || !view) return
    if (countdown <= 0) {
      store(null)
      window.location.href = view.formUrl
      return
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, view])

  if (!mission || !view) return null

  const max = steps.reduce((n, s) => n + s.points, 0)
  const points = steps.reduce((n, s) => n + (mission.credited[s.id] ? s.points : 0), 0)
  const percent = max ? Math.round((points / max) * 100) : 0
  const asks = view.ask.filter(
    (q) =>
      !mission.credited[q.step] &&
      !mission.claims.includes(q.id) &&
      !mission.declined.includes(q.id),
  )
  const answer = (q: Ask, mine: boolean) =>
    setMission((m) =>
      m
        ? {
            ...m,
            ...(mine ? { claims: [...m.claims, q.id] } : { declined: [...m.declined, q.id] }),
          }
        : m,
    )
  const leave = () => {
    store(null)
    window.location.href = START
  }
  const ring = 2 * Math.PI * 26

  return (
    <>
      <button
        aria-label={`Evaluation mission: ${percent} percent complete. Open your steps.`}
        className="fixed bottom-6 right-6 z-40 grid print:hidden h-16 w-16 place-items-center rounded-full border bg-card shadow-dialog transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen(true)}
        type="button"
      >
        <svg aria-hidden="true" className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
          <circle className="stroke-muted" cx="32" cy="32" fill="none" r="26" strokeWidth="6" />
          <circle
            className="stroke-primary transition-[stroke-dashoffset] duration-500"
            cx="32"
            cy="32"
            fill="none"
            r="26"
            strokeDasharray={ring}
            strokeDashoffset={ring * (1 - percent / 100)}
            strokeLinecap="round"
            strokeWidth="6"
          />
        </svg>
        <span className="relative text-sm font-semibold tabular-nums text-foreground">
          {percent}%
        </span>
        {asks.length ? (
          <span
            aria-hidden
            className="absolute right-0 top-0 h-4 w-4 animate-pulse rounded-full border-2 border-card bg-destructive"
          />
        ) : null}
      </button>

      <Sheet onOpenChange={setOpen} open={open}>
        <SidePanel
          containedScroll
          description={`${view.label} · ${points} of ${max} points`}
          title={done ? 'Mission complete' : 'Your mission'}
        >
          <div className="space-y-5">
            <ProgressBar label="Mission progress" value={percent} />
            {done ? (
              <div className="space-y-3 rounded-lg border bg-success-subtle p-4">
                <p className="text-sm">
                  You earned {points} of {max} points. Thank you! One last thing: a short
                  questionnaire about your experience.
                </p>
                <Button asChild>
                  <a href={view.formUrl} onClick={() => store(null)}>
                    Continue to the questionnaire
                  </a>
                </Button>
                {countdown !== null ? (
                  <p className="text-xs text-muted-foreground">
                    Opening the questionnaire in {countdown} s.
                  </p>
                ) : null}
              </div>
            ) : null}
            {asks.map((q) => (
              <div
                className="space-y-3 rounded-lg border border-warning/40 bg-warning-subtle p-4"
                key={q.id}
              >
                <p className="text-sm">
                  Someone else is using this account too. PATHWAYS recorded “
                  {steps.find((s) => s.id === q.step)?.title}” at{' '}
                  {new Date(q.at).toLocaleTimeString()}. Was that you?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => answer(q, true)} size="sm">
                    Yes, that was me
                  </Button>
                  <Button onClick={() => answer(q, false)} size="sm" variant="outline">
                    Not me
                  </Button>
                </div>
              </div>
            ))}
            {view.paused && !done ? (
              <p className="text-sm text-muted-foreground">
                Automatic checking is paused for a moment. Keep going, or mark a step as done.
              </p>
            ) : null}
            <ol className="space-y-2">
              {steps.map((s, i) => {
                const isDone = Boolean(mission.credited[s.id])
                const isCurrent = !isDone && s.id === mission.current
                return (
                  <li
                    className={cn(
                      'flex gap-3 rounded-lg border bg-card p-3',
                      isCurrent && 'border-2 border-primary',
                      isDone && 'bg-success-subtle',
                    )}
                    key={s.id}
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold',
                        isDone
                          ? 'bg-success text-success-foreground'
                          : 'bg-primary-subtle text-primary',
                      )}
                    >
                      {isDone ? <Check aria-hidden className="h-4 w-4" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          className="text-left text-sm font-semibold disabled:cursor-default"
                          disabled={isDone}
                          onClick={() => setMission((m) => (m ? { ...m, current: s.id } : m))}
                          type="button"
                        >
                          {s.title}
                        </button>
                        <StatusBadge dot={false} tone={isDone ? 'success' : 'neutral'}>
                          {isDone ? `+${s.points}` : s.points}
                        </StatusBadge>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.hint}</p>
                      {isCurrent ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {s.auto ? (
                            <span className="text-xs text-primary">Watching for this step…</span>
                          ) : null}
                          <Button
                            onClick={() => credit(s.id, 'manual')}
                            size="sm"
                            variant={s.auto ? 'ghost' : 'default'}
                          >
                            {s.auto ? 'Mark as done' : 'I did this'}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
            <Button onClick={leave} size="sm" variant="ghost">
              Not your role? Start over
            </Button>
          </div>
        </SidePanel>
      </Sheet>
    </>
  )
}
