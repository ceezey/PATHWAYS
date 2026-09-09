'use client'
import { Button } from '@/components/ui/button'
import {
  type DemoScenario,
  advanceDemoClock,
  currentAccount,
  demoPolicy,
  demoScenarios,
  getDemoStorageError,
  resetDemo,
  setDemoScenario,
  switchDemoAccount,
} from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function DemoControls() {
  const state = useDemoState()
  const actor = currentAccount(state)
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const run = (action: () => void) => {
    try {
      action()
      setMessage('Review state updated.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Review action failed.')
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Local demo review controls</h1>
      <p>
        Fictional data only. These controls deliberately simulate account switching and failures;
        they are not production security or services.
      </p>
      <div className="flex gap-4">
        <Link className="underline" href="/dashboard">
          Workspace
        </Link>
        <Link className="underline" href="/staff/login">
          Sign in
        </Link>
        <Link className="underline" href="/public/projects">
          Anonymous public tracker
        </Link>
      </div>
      <label className="block space-y-2">
        Fictional account
        <select
          className="block w-full rounded border p-2"
          disabled={!ready}
          value={actor?.id ?? ''}
          onChange={(e) => run(() => switchDemoAccount(e.target.value || null))}
        >
          <option value="">Anonymous / signed out</option>
          {state.accounts.map((a) => (
            <option key={a.id} value={a.id} disabled={a.status !== 'Active'}>
              {a.name} — {a.role} ({a.status})
            </option>
          ))}
        </select>
      </label>
      <p>Authorized projects: {actor?.projectIds.join(', ') || 'Public approved data only'}</p>
      <label className="block space-y-2">
        Exception scenario
        <select
          className="block w-full rounded border p-2"
          disabled={!ready}
          value={state.scenario}
          onChange={(e) => run(() => setDemoScenario(e.target.value as DemoScenario))}
        >
          {demoScenarios.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <p>
        Clear the scenario to retry the same input. Scenario selection persists across navigation
        and refresh.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={!ready} onClick={() => run(() => advanceDemoClock(16))}>
          Advance demo clock 16 minutes
        </Button>
        <Button
          disabled={!ready}
          variant="destructive"
          onClick={() => {
            if (
              window.confirm(
                'Reset all fictional records and sign out? This removes only the versioned demo dataset.',
              )
            )
              run(resetDemo)
          }}
        >
          Reset demo data
        </Button>
      </div>
      <p>
        Demo clock: {new Date(state.clock).toISOString()}. Password: PathwaysDemo!2026. Reset expiry{' '}
        {demoPolicy.resetMinutes} minutes, PIN {demoPolicy.pinMinutes} minutes; password 12–64
        characters with upper/lowercase, number and symbol. SADDD warning{' '}
        {demoPolicy.sadddMissingPercent}%; export limit 5 MiB.
      </p>
      <output className="block">
        {message ||
          getDemoStorageError() ||
          (ready ? 'Review controls ready.' : 'Loading review controls.')}
      </output>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Fictional notification inboxes</h2>
        <p>Review-only view of named demo recipients. No external messages are sent.</p>
        {state.notifications.length === 0 ? (
          <p>No fictional notifications yet.</p>
        ) : (
          state.notifications.map((notice) => (
            <article key={notice.id} className="rounded border p-3">
              <h3 className="font-semibold">
                {notice.recipient} · {notice.status}
              </h3>
              <p>{notice.message}</p>
              {notice.href ? (
                <Link className="underline" href={notice.href}>
                  Open local link
                </Link>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  )
}
