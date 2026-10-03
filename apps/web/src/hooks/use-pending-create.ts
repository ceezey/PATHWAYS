'use client'
import type { ApplicationProfile } from '@/features/auth/auth-access'
import {
  type PendingCreateMarker,
  clearPendingCreate,
  isDefinitiveClientError,
  pendingCreateConfirmMs,
  pendingCreateKey,
  pendingCreateNotice,
  pendingCreatePollMs,
  readPendingCreate,
  writePendingCreate,
} from '@/lib/forms/pending-create'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

type Options<T> = {
  profile: ApplicationProfile | null
  /** Form kind, such as "project" or "activity". */
  kind: string
  projectId?: string | null
  /** Reads existing data and returns the record created since startedAt, if any. */
  findCreated: (fingerprint: string, startedAt: number) => Promise<T | null | undefined>
  onConfirmed?: (record: T) => void
  successMessage: string
}

/** Guards a create form against double submit and against a reload while the create is still processing. */
export function usePendingCreate<T>(options: Options<T>) {
  const { profile, kind, projectId = null } = options
  const key = profile
    ? pendingCreateKey(kind, {
        organizationId: profile.organizationId,
        userId: profile.userId,
        projectId,
      })
    : null
  const latest = useRef(options)
  latest.current = options
  const inFlight = useRef(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])

  const confirm = useCallback(
    (storageKey: string, marker: PendingCreateMarker) => {
      stop()
      setConfirming(true)
      const deadline = Date.now() + pendingCreateConfirmMs
      let busy = false
      const finish = () => {
        stop()
        clearPendingCreate(storageKey)
        setConfirming(false)
      }
      timer.current = setInterval(async () => {
        if (busy) return
        busy = true
        try {
          const record = await latest.current.findCreated(marker.fingerprint, marker.startedAt)
          if (timer.current === null) return
          if (record) {
            finish()
            toast.success(latest.current.successMessage)
            latest.current.onConfirmed?.(record)
            return
          }
        } catch {
          /* Keep polling until the deadline. */
        } finally {
          busy = false
        }
        if (timer.current !== null && Date.now() >= deadline) {
          finish()
          setNotice(pendingCreateNotice)
        }
      }, pendingCreatePollMs)
    },
    [stop],
  )

  useEffect(() => {
    if (!key) return
    const marker = readPendingCreate(key)
    if (marker) confirm(key, marker)
    return stop
  }, [key, confirm, stop])

  /** Runs the create once; returns undefined when a pending create made the call a no-op. */
  const submit = useCallback(
    async <R>(fingerprint: string, run: () => Promise<R>): Promise<R | undefined> => {
      if (!key || inFlight.current || confirming || readPendingCreate(key)) return undefined
      inFlight.current = true
      setNotice(null)
      const marker = { startedAt: Date.now(), fingerprint }
      writePendingCreate(key, marker)
      try {
        const result = await run()
        clearPendingCreate(key)
        return result
      } catch (error) {
        if (isDefinitiveClientError(error)) clearPendingCreate(key)
        else confirm(key, marker)
        throw error
      } finally {
        inFlight.current = false
      }
    },
    [key, confirming, confirm],
  )

  return { submit, confirming, notice }
}
