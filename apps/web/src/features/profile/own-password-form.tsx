'use client'

import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { ownProfileClient } from '@/lib/services/own-profile-client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { OwnPasswordDialog, type PasswordStep } from './own-password-dialog'
import {
  bindPasswordSession,
  createPasswordAuthClient,
  currentContinuation,
} from './own-password-operation'
import { ownPasswordSchema } from './own-profile-contract'

const UNCERTAIN =
  'The password change could not be confirmed. Sign in with the new password before trying again.'
const REAUTH_CODES = new Set([
  'reauthentication_needed',
  'reauthentication_not_valid',
  'reauth_nonce_missing',
])

export function OwnPasswordForm() {
  const { session, signOut } = useSession()
  const { profile, access } = useCurrentRole()
  const owner = JSON.stringify([
    session?.user.id,
    profile?.organizationId,
    profile?.userId,
    profile?.roles,
    profile?.permissions,
    access,
  ])
  const live = useRef({ owner, mounted: true, generation: 0 })
  if (live.current.owner !== owner) {
    live.current.owner = owner
    live.current.generation += 1
  }
  useEffect(() => {
    live.current.mounted = true
    return () => {
      live.current.mounted = false
      live.current.generation += 1
    }
  }, [])
  const captureCurrent = () => {
    const generation = live.current.generation
    return () =>
      live.current.mounted &&
      live.current.generation === generation &&
      live.current.owner === owner &&
      access === 'ready' &&
      Boolean(profile?.permissions.includes('profile.manage'))
  }
  const [step, setStep] = useState<PasswordStep | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const inFlight = useRef(false)
  const verifiedClient = useRef<SupabaseClient | null>(null)
  const subject = session?.user.id

  const close = () => {
    verifiedClient.current = null
    setStep(null)
  }

  const verifyCode = async (code: string) => {
    const isCurrent = captureCurrent()
    if (inFlight.current || uncertain) return
    inFlight.current = true
    setBusy(true)
    setNotice('')
    const { step: run } = currentContinuation(isCurrent)
    try {
      if (!session || !subject || !/^\d{6}$/.test(code)) throw new Error('verification')
      const client = createPasswordAuthClient()
      await bindPasswordSession(client, session, isCurrent)
      const current = await run(() => client.auth.getUser())
      if (current.error || current.data.user?.id !== subject) throw new Error('verification')
      const factors = await run(() => client.auth.mfa.listFactors())
      const factor = factors.data?.totp.find((entry) => entry.status === 'verified')
      if (factors.error || !factor) throw new Error('verification')
      const verification = await run(() =>
        client.auth.mfa.challengeAndVerify({ factorId: factor.id, code }),
      )
      if (verification.error) throw new Error('rejected')
      const verified = await run(() => client.auth.getUser())
      if (verified.error || verified.data.user?.id !== subject) throw new Error('verification')
      await run(() => ownProfileClient.read())
      // The verified AAL2 session lives only in this client, so the next step reuses it.
      verifiedClient.current = client
      setStep('password')
    } catch (error) {
      if (!isCurrent()) return
      setNotice(
        error instanceof Error && error.message === 'rejected'
          ? 'The code was not accepted. Try the next authenticator code.'
          : 'Account verification failed. Check your session and authenticator code.',
      )
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const isCurrent = captureCurrent()
    if (inFlight.current || uncertain) return
    const form = event.currentTarget
    const parsed = ownPasswordSchema.safeParse(Object.fromEntries(new FormData(form)))
    if (!parsed.success) {
      setNotice(parsed.error.issues[0]?.message ?? 'Review the password fields.')
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice('')
    let mutationStarted = false
    const { step: run, assertCurrent } = currentContinuation(isCurrent)
    try {
      const client = verifiedClient.current
      if (!session || !subject || !client) throw new Error('verification')
      const verified = await run(() => client.auth.getUser())
      if (verified.error || verified.data.user?.id !== subject) throw new Error('verification')
      await run(() => ownProfileClient.read())
      assertCurrent()
      mutationStarted = true
      const result = await client.auth.updateUser({ password: parsed.data.password })
      if (!isCurrent()) return
      if (result.error) {
        close()
        if (REAUTH_CODES.has(result.error.code ?? '')) {
          // Auth definitely refused the change, so a retry after a fresh sign-in is safe.
          setNotice('For security, sign out and sign in again, then change your password.')
          return
        }
        // Auth may have committed before a transport failure. Never invite a blind retry.
        setUncertain(true)
        setNotice(UNCERTAIN)
        return
      }
      setUncertain(true)
      close()
      setNotice('Password changed. Signing out; sign in again with your new password.')
      try {
        await signOut()
      } catch {
        setNotice(
          'Password changed. Sign-out could not be confirmed. Close this browser window and sign in again.',
        )
      }
    } catch {
      if (!isCurrent()) return
      close()
      if (mutationStarted) {
        setUncertain(true)
        setNotice(UNCERTAIN)
      } else setNotice('Account verification failed. Check your session and try again.')
    } finally {
      form.reset()
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Confirm your authenticator code, then choose a new password.
      </p>
      <Button
        disabled={busy || uncertain}
        onClick={() => {
          setNotice('')
          setStep('code')
        }}
        type="button"
        variant="outline"
      >
        Change password
      </Button>
      {step && (
        <OwnPasswordDialog
          step={step}
          busy={busy}
          notice={notice}
          onVerify={(code) => void verifyCode(code)}
          onSubmit={(event) => void submit(event)}
          onClose={close}
        />
      )}
      {notice && !step && <output className="block text-sm">{notice}</output>}
    </div>
  )
}
