'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSession } from '@/hooks/use-session'
import { SESSION_ENDED_EVENT } from '@/lib/api/core/authorized-read-events'
import { sessionsClient } from '@/lib/api/sessions'

// Mirrors the API's 30 idle minutes (migration 0094); the warning shows 2 minutes before.
export const IDLE_LIMIT_MS = 30 * 60_000
export const IDLE_WARNING_MS = 28 * 60_000
const HEARTBEAT_MS = 60_000
// Shared by every tab of this browser, so working in one tab keeps the others signed in.
export const LAST_ACTIVE_KEY = 'pathways:last-active'
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

const readLastActive = () => Number(window.localStorage.getItem(LAST_ACTIVE_KEY)) || 0

const formatLeft = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// Signs the browser out after 30 idle minutes, or at once when the API reports the session ended.
export const SessionTimeoutGuard = () => {
  const { signOut } = useSession()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const sending = useRef(false)
  const lastAttempt = useRef(0)
  const leaving = useRef(false)
  const stayButton = useRef<HTMLButtonElement>(null)

  // The idle clock restarts only when the API confirms the activity, so it never runs ahead of the server's.
  const heartbeat = useCallback(async (force = false) => {
    const now = Date.now()
    if (sending.current) return
    if (!force && now - Math.max(readLastActive(), lastAttempt.current) < HEARTBEAT_MS) return
    sending.current = true
    lastAttempt.current = now
    try {
      await sessionsClient.heartbeat()
      window.localStorage.setItem(LAST_ACTIVE_KEY, String(now))
    } catch {
      // The clock keeps running; a SESSION_ENDED reply signs the browser out through the event below.
    } finally {
      sending.current = false
    }
  }, [])

  const leave = useCallback(
    async (reason: 'idle' | 'session') => {
      if (leaving.current) return
      leaving.current = true
      try {
        await signOut()
      } catch {
        // The sign-in page is still the right place to land.
      }
      window.location.assign(`/staff/login?ended=${reason}`)
    },
    [signOut],
  )

  useEffect(() => {
    // A page load is activity; the forced heartbeat also catches a session the API already ended.
    window.localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
    void heartbeat(true)
    const onActivity = () => void heartbeat()
    const onEnded = () => void leave('session')
    for (const name of ACTIVITY_EVENTS)
      window.addEventListener(name, onActivity, { capture: true, passive: true })
    window.addEventListener(SESSION_ENDED_EVENT, onEnded)
    const timer = window.setInterval(() => {
      const idle = Date.now() - readLastActive()
      if (idle >= IDLE_LIMIT_MS) void leave('idle')
      setSecondsLeft(
        idle >= IDLE_WARNING_MS ? Math.max(0, Math.ceil((IDLE_LIMIT_MS - idle) / 1000)) : null,
      )
    }, 1000)
    return () => {
      for (const name of ACTIVITY_EVENTS)
        window.removeEventListener(name, onActivity, { capture: true })
      window.removeEventListener(SESSION_ENDED_EVENT, onEnded)
      window.clearInterval(timer)
    }
  }, [heartbeat, leave])

  return (
    <Dialog open={secondsLeft !== null} onOpenChange={(open) => !open && void heartbeat(true)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          stayButton.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>You will be signed out soon</DialogTitle>
          <DialogDescription>
            You have not used PATHWAYS for a while. To protect beneficiary data, you will be signed
            out in {formatLeft(secondsLeft ?? 0)}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void leave('idle')}>
            Sign out
          </Button>
          <Button ref={stayButton} type="button" onClick={() => void heartbeat(true)}>
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
