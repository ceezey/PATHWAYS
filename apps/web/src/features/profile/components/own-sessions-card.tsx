'use client'

import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { type AppSession, sessionsClient } from '@/lib/api/sessions'
import { deviceLabel } from '../session-device'

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})
const formatTime = (value: string) => timeFormatter.format(new Date(value))

// The caller's signed-in devices, with sign-out per device and for every other device.
export const OwnSessionsCard = () => {
  const [sessions, setSessions] = useState<AppSession[] | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setSessions(await sessionsClient.list())
    } catch {
      setNotice('Signed-in devices could not be loaded. Reload the page to try again.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true)
    setNotice('')
    try {
      await action()
      setNotice(done)
      await load()
    } catch {
      setNotice('That device could not be signed out. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const others = sessions?.filter((session) => !session.current) ?? []
  return (
    <div className="space-y-4">
      {sessions === null && !notice && <output className="text-sm">Loading devices...</output>}
      {sessions && (
        <ul className="divide-y divide-border">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {deviceLabel(session.device)}
                  {session.current && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  Signed in {formatTime(session.startedAt)} · Last active{' '}
                  {formatTime(session.lastActiveAt)}
                </p>
              </div>
              {!session.current && (
                <Button
                  disabled={busy}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void run(() => sessionsClient.end(session.id), 'That device was signed out.')
                  }
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <Button
          disabled={busy}
          type="button"
          variant="outline"
          onClick={() =>
            void run(() => sessionsClient.endOthers(), 'Your other devices were signed out.')
          }
        >
          Sign out other devices
        </Button>
      )}
      {notice && <output className="block text-sm">{notice}</output>}
    </div>
  )
}
