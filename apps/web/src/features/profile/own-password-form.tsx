'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { ownProfileClient } from '@/lib/services/own-profile-client'
import { useEffect, useRef, useState } from 'react'
import {
  bindPasswordSession,
  createPasswordAuthClient,
  currentContinuation,
} from './own-password-operation'
import { ownPasswordSchema } from './own-profile-contract'

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
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const inFlight = useRef(false)
  const subject = session?.user.id

  const sendCode = async () => {
    const isCurrent = captureCurrent()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice('')
    const { step } = currentContinuation(isCurrent)
    try {
      if (!session || !subject) throw new Error('unavailable')
      const client = createPasswordAuthClient()
      await bindPasswordSession(client, session, isCurrent)
      await step(() => ownProfileClient.read())
      const { error } = await step(() => client.auth.reauthenticate())
      if (error) throw new Error('unavailable')
      setSent(true)
      setNotice('Enter the code sent to your email or phone and a fresh authenticator code.')
    } catch {
      if (isCurrent())
        setNotice('Password verification could not start. Check your session and try again.')
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
    const { step, assertCurrent } = currentContinuation(isCurrent)
    try {
      if (!session || !subject) throw new Error('verification')
      const client = createPasswordAuthClient()
      await bindPasswordSession(client, session, isCurrent)
      const current = await step(() => client.auth.getUser())
      if (current.error || current.data.user?.id !== subject) throw new Error('verification')
      const factors = await step(() => client.auth.mfa.listFactors())
      const factor = factors.data?.totp.find((entry) => entry.status === 'verified')
      if (factors.error || !factor) throw new Error('verification')
      const verification = await step(() =>
        client.auth.mfa.challengeAndVerify({
          factorId: factor.id,
          code: parsed.data.mfaCode,
        }),
      )
      if (verification.error) throw new Error('verification')
      const verified = await step(() => client.auth.getUser())
      if (verified.error || verified.data.user?.id !== subject) throw new Error('verification')
      await step(() => ownProfileClient.read())
      assertCurrent()
      mutationStarted = true
      const result = await client.auth.updateUser({
        password: parsed.data.password,
        nonce: parsed.data.nonce,
      })
      if (!isCurrent()) return
      if (result.error) {
        // Auth may have committed before a transport failure. Never invite a blind retry.
        setUncertain(true)
        setNotice(
          'The password change could not be confirmed. Sign in with the new password before trying again.',
        )
        return
      }
      setUncertain(true)
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
      if (mutationStarted) {
        setUncertain(true)
        setNotice(
          'The password change could not be confirmed. Sign in with the new password before trying again.',
        )
      } else setNotice('Account verification failed. Check your session and verification codes.')
    } finally {
      form.reset()
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Verify your account with email or phone and your authenticator before changing your
        password.
      </p>
      <Button
        disabled={busy || uncertain}
        onClick={() => void sendCode()}
        type="button"
        variant="outline"
      >
        {busy ? 'Verifying...' : sent ? 'Send a new verification code' : 'Send verification code'}
      </Button>
      {sent && (
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          {[
            ['nonce', 'Email or phone verification code', 'text', 'one-time-code'],
            ['mfaCode', 'Authenticator code', 'text', 'one-time-code'],
            ['password', 'New password', 'password', 'new-password'],
            ['confirmPassword', 'Confirm new password', 'password', 'new-password'],
          ].map(([name, label, type, autoComplete]) => (
            <div key={name} className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`own-${name}`}>
                {label}
              </label>
              <Input
                autoComplete={autoComplete}
                disabled={busy || uncertain}
                id={`own-${name}`}
                name={name}
                type={type}
                required
                maxLength={type === 'password' ? 64 : 10}
                inputMode={type === 'password' ? undefined : 'numeric'}
              />
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Use 12 to 64 characters with uppercase, lowercase, a number, and a symbol.
          </p>
          <Button disabled={busy || uncertain} type="submit">
            {busy ? 'Changing password...' : 'Change password'}
          </Button>
        </form>
      )}
      {notice && <output className="block text-sm">{notice}</output>}
    </div>
  )
}
