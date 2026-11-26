'use client'

import { useCallback, useEffect, useState } from 'react'

import { ConfirmationDialog } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { isStepUpRequired } from '@/features/settings/backup-recovery.utils'
import { StepUpCodeField, useStepUpCode } from '@/features/settings/components/step-up-code-field'
import { type AppSession, sessionsClient } from '@/lib/api/sessions'
import { deviceLabel } from '../session-device'

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})
const formatTime = (value: string) => timeFormatter.format(new Date(value))

type Target = { kind: 'one'; session: AppSession } | { kind: 'others' }

// The caller's signed-in devices, with sign-out per device and for every other device, each behind an authenticator code.
export const OwnSessionsCard = () => {
  const [sessions, setSessions] = useState<AppSession[] | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<Target | null>(null)
  const [required, setRequired] = useState(false)
  const [dialogNotice, setDialogNotice] = useState('')
  const step = useStepUpCode(target !== null, required)

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

  const close = () => {
    setTarget(null)
    setRequired(false)
    setDialogNotice('')
  }

  const confirm = async () => {
    if (!target || !(await step.verify())) return
    setBusy(true)
    setDialogNotice('')
    try {
      if (target.kind === 'one') await sessionsClient.end(target.session.id)
      else await sessionsClient.endOthers()
      setNotice(
        target.kind === 'one'
          ? 'That device was signed out.'
          : 'Your other devices were signed out.',
      )
      close()
    } catch (caught) {
      if (isStepUpRequired(caught)) {
        // The dialog stays open with the code field, since the API asked for a fresh code.
        setRequired(true)
        setDialogNotice('Enter the code from your authenticator app to continue.')
      } else {
        setNotice('Signing out could not be completed. Try again.')
        close()
      }
    } finally {
      // Reloaded either way: a device that already signed out leaves the list.
      await load()
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
                  aria-label={`Sign out ${deviceLabel(session.device)}`}
                  disabled={busy}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setTarget({ kind: 'one', session })}
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
          onClick={() => setTarget({ kind: 'others' })}
        >
          Sign out other devices
        </Button>
      )}
      {notice && <output className="block text-sm">{notice}</output>}
      <ConfirmationDialog
        open={target !== null}
        // A running code check or sign-out keeps its dialog, so its result is never lost.
        onOpenChange={(next) => step.checking || busy || next || close()}
        title={
          target?.kind === 'one'
            ? `Sign out ${deviceLabel(target.session.device)}?`
            : 'Sign out other devices?'
        }
        description={
          target?.kind === 'others'
            ? 'You will need to sign in again on those devices.'
            : 'You will need to sign in again on that device.'
        }
        confirmLabel="Sign out"
        confirmVariant="default"
        confirmDisabled={busy || step.checking || step.incomplete}
        onConfirm={() => void confirm()}
      >
        <StepUpCodeField step={step} />
        {dialogNotice && (
          <p role="alert" className="text-sm text-danger">
            {dialogNotice}
          </p>
        )}
      </ConfirmationDialog>
    </div>
  )
}
