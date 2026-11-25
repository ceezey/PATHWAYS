'use client'

import { useEffect, useRef, useState } from 'react'

import { webEnv } from '@/lib/env'

/** Empty means CAPTCHA is off: no widget, no token and no disabled button anywhere. */
export const captchaSiteKey = webEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type Turnstile = {
  render: (holder: HTMLElement, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let loading: Promise<Turnstile> | undefined

// The app's own code adds the script, which the content security policy's strict-dynamic trusts.
const loadTurnstile = () => {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => {
      // A later mount may try again.
      loading = undefined
      reject(new Error('Turnstile unavailable'))
    }
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail())
    script.onerror = fail
    document.head.append(script)
  })
  return loading
}

/** The Turnstile check; reports its one-time token, or an empty string when it expires or fails. */
export function CaptchaField({ onToken }: { onToken: (token: string) => void }) {
  const holder = useRef<HTMLDivElement>(null)
  const report = useRef(onToken)
  report.current = onToken
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!captchaSiteKey) return
    let active = true
    let widgetId: string | undefined
    loadTurnstile().then(
      (turnstile) => {
        if (!active || !holder.current) return
        widgetId = turnstile.render(holder.current, {
          sitekey: captchaSiteKey,
          callback: (token: string) => report.current(token),
          'expired-callback': () => report.current(''),
          'error-callback': () => report.current(''),
        })
      },
      () => {
        if (active) setUnavailable(true)
      },
    )
    return () => {
      active = false
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [])

  if (!captchaSiteKey) return null
  return unavailable ? (
    <p className="text-sm text-destructive" role="alert">
      The security check could not load. Refresh the page.
    </p>
  ) : (
    <div ref={holder} />
  )
}
