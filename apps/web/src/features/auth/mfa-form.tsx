'use client'

import { LoaderCircle, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  AuthAccessError,
  type MfaStatus,
  developerAuthUserId,
  parseMfaStatus,
  requestAuthJson,
} from './auth-access'
import { getQrImageSource, getVerifiedTotpFactors, isTotpCode, verifyTotpCode } from './mfa-flow'

interface FactorChoice {
  id: string
  status: string
  factor_type: string
}

export function MfaForm() {
  const router = useRouter()
  const { session, status, configured, refreshSession, signOut } = useSession()
  const {
    access,
    accessError,
    accessRefreshing,
    refreshAccess,
    claimWorkspaceHandoff,
    resetWorkspaceHandoff,
  } = useCurrentRole()
  const supabase = getBrowserSupabaseClient()
  const token = session?.access_token ?? null
  const tokenRef = useRef(token)
  tokenRef.current = token
  const operation = useRef(0)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [enrollmentAttempted, setEnrollmentAttempted] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [check, setCheck] = useState<{
    token: string
    refresh: number
    status: MfaStatus
    factors: FactorChoice[]
  } | null>(null)
  const [enrollment, setEnrollment] = useState<{
    token: string
    factorId: string
    qr: string
  } | null>(null)
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const handoffAttempted = useRef(false)
  const handoffUser = useRef(session?.user.id)
  const [handoff, setHandoff] = useState<'idle' | 'opening' | 'stalled'>('idle')
  const allowedAccount = session?.user.id === developerAuthUserId
  const current = check?.token === token && check?.refresh === refresh ? check : null
  const privateEnrollment = enrollment?.token === token ? enrollment : null
  const verifiedFactors = getVerifiedTotpFactors(current?.factors ?? [])
  const choices = verifiedFactors.length
    ? verifiedFactors
    : (current?.factors.filter((factor) => factor.factor_type === 'totp') ?? [])

  useEffect(() => {
    if (handoffUser.current !== session?.user.id) {
      handoffUser.current = session?.user.id
      handoffAttempted.current = false
      setHandoff('idle')
    }
  }, [session?.user.id])

  useEffect(() => {
    if (current?.status.aal === 'aal1') {
      handoffAttempted.current = false
      setHandoff('idle')
    }
    if (
      !configured ||
      status !== 'authenticated' ||
      !allowedAccount ||
      current?.status.aal !== 'aal2' ||
      !current.status.applicationAccessEnabled ||
      access !== 'ready' ||
      accessRefreshing ||
      handoffAttempted.current
    )
      return
    handoffAttempted.current = true
    if (!claimWorkspaceHandoff()) {
      setHandoff('stalled')
      return
    }
    setHandoff('opening')
    try {
      // Fixed destination only. /workspace independently checks the live
      // session/context and dashboard capability before redirecting there.
      router.replace('/workspace')
    } catch {
      setHandoff('stalled')
    }
  }, [
    configured,
    status,
    allowedAccount,
    current,
    access,
    accessRefreshing,
    claimWorkspaceHandoff,
    router,
  ])

  useEffect(() => {
    if (handoff !== 'opening') return
    const timeout = window.setTimeout(() => setHandoff('stalled'), 30_000)
    return () => window.clearTimeout(timeout)
  }, [handoff])

  useEffect(() => {
    const controller = new AbortController()
    const currentOperation = ++operation.current
    inFlight.current = false
    setBusy(false)
    setEnrollmentAttempted(false)
    setCode('')
    setEnrollment(null)
    setFactorId('')
    setCheck(null)
    setError('')
    if (!supabase || !token || !allowedAccount) return () => controller.abort()

    const inspect = async () => {
      try {
        const result = parseMfaStatus(
          await requestAuthJson(
            webEnv.NEXT_PUBLIC_API_BASE_URL,
            '/auth/mfa/status',
            token,
            controller.signal,
          ),
        )
        if (controller.signal.aborted || currentOperation !== operation.current) return
        let factors: FactorChoice[] = []
        if (result.aal !== 'aal2') {
          const response = await supabase.auth.mfa.listFactors()
          if (response.error) throw new Error('MFA factor check failed.')
          factors = response.data.all
        }
        if (controller.signal.aborted || currentOperation !== operation.current) return
        setCheck({ token, refresh, status: result, factors })
        const verified = getVerifiedTotpFactors(factors)
        setFactorId(
          verified[0]?.id ?? factors.find((factor) => factor.factor_type === 'totp')?.id ?? '',
        )
      } catch (cause) {
        if (!controller.signal.aborted && currentOperation === operation.current) {
          setError(
            cause instanceof AuthAccessError
              ? cause.message
              : 'The local API returned an invalid MFA status. Stop and ask for review. No access was granted.',
          )
        }
      }
    }
    void inspect()
    return () => {
      controller.abort()
      ++operation.current
    }
  }, [allowedAccount, supabase, token, refresh])

  useEffect(() => {
    const clearPrivateState = () => {
      ++operation.current
      setEnrollment(null)
      setCode('')
      setFactorId('')
      setCheck(null)
    }
    window.addEventListener('pagehide', clearPrivateState)
    const recheckRestoredPage = () => setRefresh((value) => value + 1)
    window.addEventListener('pageshow', recheckRestoredPage)
    return () => {
      window.removeEventListener('pagehide', clearPrivateState)
      window.removeEventListener('pageshow', recheckRestoredPage)
    }
  }, [])

  const assertCurrentSession = async (expectedToken: string, expectedOperation: number) => {
    if (
      !supabase ||
      tokenRef.current !== expectedToken ||
      operation.current !== expectedOperation
    ) {
      throw new Error('Session changed. Sign in again.')
    }
    const result = await supabase.auth.getSession()
    if (
      result.error ||
      result.data.session?.access_token !== expectedToken ||
      result.data.session.user.id !== developerAuthUserId ||
      tokenRef.current !== expectedToken ||
      operation.current !== expectedOperation
    ) {
      throw new Error('Session changed. Sign in again.')
    }
  }

  const enroll = async () => {
    if (
      !supabase ||
      !token ||
      !current ||
      !allowedAccount ||
      inFlight.current ||
      enrollmentAttempted
    )
      return
    inFlight.current = true
    setEnrollmentAttempted(true)
    const currentOperation = ++operation.current
    setBusy(true)
    setError('')
    setCode('')
    try {
      const fresh = parseMfaStatus(
        await requestAuthJson(webEnv.NEXT_PUBLIC_API_BASE_URL, '/auth/mfa/status', token),
      )
      if (fresh.aal !== 'aal1') throw new Error('No enrollment is needed.')
      await assertCurrentSession(token, currentOperation)
      const existing = await supabase.auth.mfa.listFactors()
      if (existing.error || existing.data.all.length !== 0) {
        throw new Error('An existing factor must be preserved.')
      }
      await assertCurrentSession(token, currentOperation)
      // Mutation requires this explicit button click; no effect ever enrolls or removes a factor.
      const result = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (result.error) throw new Error('Enrollment could not be confirmed.')
      if (operation.current !== currentOperation || tokenRef.current !== token) return
      setEnrollment({
        token,
        factorId: result.data.id,
        qr: getQrImageSource(result.data.totp.qr_code),
      })
      setFactorId(result.data.id)
    } catch {
      if (operation.current === currentOperation) {
        setError(
          'Setup could not be confirmed. Do not repeatedly enroll. Recheck existing factors; no factor was deleted or replaced.',
        )
      }
    } finally {
      if (operation.current === currentOperation) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  const verify = async () => {
    if (!supabase || !token || !allowedAccount || !current || inFlight.current) return
    if (!isTotpCode(code)) {
      setError('Enter exactly six digits from your authenticator app.')
      return
    }
    const selectedFactor = privateEnrollment?.factorId ?? factorId
    if (!privateEnrollment && !choices.some((factor) => factor.id === selectedFactor)) return
    inFlight.current = true
    const currentOperation = ++operation.current
    setBusy(true)
    setError('')
    const submittedCode = code
    setCode('')
    try {
      const fresh = parseMfaStatus(
        await requestAuthJson(webEnv.NEXT_PUBLIC_API_BASE_URL, '/auth/mfa/status', token),
      )
      if (fresh.aal !== 'aal1') throw new Error('Recheck the current session.')
      await verifyTotpCode(supabase.auth.mfa, selectedFactor, submittedCode, () =>
        assertCurrentSession(token, currentOperation),
      )
      setEnrollment(null)
      // Supabase emits the changed MFA session. The effect/API re-check decides
      // whether aal2 is verified; this success never unlocks business routes.
      await refreshSession()
      refreshAccess()
      setRefresh((value) => value + 1)
    } catch {
      if (operation.current === currentOperation) {
        setError(
          'Verification was not accepted. Try the next six-digit code. If your session changed, sign in again.',
        )
      }
    } finally {
      if (operation.current === currentOperation) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  const leave = async () => {
    ++operation.current
    setEnrollment(null)
    setCode('')
    setCheck(null)
    setFactorId('')
    setBusy(true)
    try {
      await signOut()
      router.replace('/staff/login')
    } catch {
      setError(
        'Sign-out could not be confirmed. Close this private browser window before continuing.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl" data-private="true">
      <CardHeader>
        <ShieldCheck className="mb-2 h-9 w-9 text-primary" aria-hidden="true" />
        <CardTitle>Developer security check</CardTitle>
        <CardDescription>
          MFA setup for the one approved PATHWAYS-dev account. This page does not create an
          organization, assign an administrator role, or enable real-user onboarding.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {!configured ? (
          <p>The approved development authentication connection is not configured.</p>
        ) : status === 'loading' ? (
          <output>Checking your session...</output>
        ) : !session ? (
          <p>Sign in with the designated developer account before setting up MFA.</p>
        ) : !allowedAccount ? (
          <p role="alert">
            This is not the designated developer account. Sign out and use the approved account. No
            setup or protected access is allowed.
          </p>
        ) : !current ? (
          <output>
            {error ? 'Verification is blocked.' : 'Checking the local API before MFA setup...'}
          </output>
        ) : current.status.aal === 'aal2' ? (
          <div className="space-y-4">
            <output>MFA session verified by the API (aal2).</output>
            {!current.status.applicationAccessEnabled ? (
              <p>
                Application access is still disabled. The separately approved administrator
                provisioning and access gate must be completed next. No business data is available
                here.
              </p>
            ) : access === 'ready' ? (
              <div className="space-y-3">
                <p>Your identity and application access are verified.</p>
                {handoff === 'stalled' ? (
                  <p role="alert">
                    Dashboard navigation could not be completed. Recheck securely to try again, or
                    sign out. No additional access was granted.
                  </p>
                ) : (
                  <output className="flex items-center gap-2" aria-live="polite" aria-busy="true">
                    <LoaderCircle
                      className="h-5 w-5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    Opening your dashboard...
                  </output>
                )}
              </div>
            ) : (
              <div className="space-y-3" aria-busy={access === 'loading'}>
                {access === 'loading' ? (
                  <output>Finding your authorized workspace...</output>
                ) : access === 'no_workspace' ? (
                  <output>
                    No authorized workspace is available. Ask the development administrator to
                    review your access, or sign out. You can recheck after access is updated.
                  </output>
                ) : accessError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {accessError}
                  </p>
                ) : (
                  <output>
                    Workspace access is not available. Recheck securely or ask the development
                    administrator for help.
                  </output>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {privateEnrollment ? (
              <>
                <p>
                  Open your authenticator app and scan this private QR code. Do not screenshot,
                  share, or paste it. It is shown only in this page's memory.
                </p>
                {/* Sensitive inline QR must never use a remote image proxy. */}
                <img
                  alt="Private authenticator setup QR code"
                  src={privateEnrollment.qr}
                  width={240}
                  height={240}
                  className="mx-auto bg-white p-3"
                />
              </>
            ) : current.factors.length === 0 ? (
              <>
                <p>
                  Have your authenticator app ready. Clicking below creates one TOTP factor for this
                  account. The code and verification stay between your browser and Supabase Auth.
                </p>
                <Button
                  type="button"
                  disabled={busy || enrollmentAttempted}
                  onClick={() => void enroll()}
                >
                  Set up authenticator
                </Button>
              </>
            ) : choices.length ? (
              <>
                <p>
                  {verifiedFactors.length
                    ? 'Use your existing authenticator. No new factor will be created.'
                    : 'An unfinished setup already exists. If you scanned its QR code, verify it below. Otherwise stop and request a reviewed recovery; this page never replaces or deletes factors.'}
                </p>
                {choices.length > 1 && (
                  <>
                    <label className="block text-sm" htmlFor="mfa-factor">
                      Authenticator factor
                    </label>
                    <select
                      id="mfa-factor"
                      className="w-full rounded border p-2"
                      value={factorId}
                      disabled={busy}
                      onChange={(event) => {
                        setFactorId(event.target.value)
                        setCode('')
                      }}
                    >
                      {choices.map((factor, index) => (
                        <option key={factor.id} value={factor.id}>
                          Authenticator {index + 1} ({factor.id.slice(0, 8)})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            ) : (
              <p>
                An unsupported factor exists. Stop and request a reviewed recovery; no factor will
                be changed here.
              </p>
            )}
            {(privateEnrollment || choices.length > 0) && (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void verify()
                }}
              >
                <label className="block text-sm" htmlFor="mfa-code">
                  Six-digit authenticator code
                </label>
                <Input
                  id="mfa-code"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={busy}
                  required
                />
                <Button type="submit" disabled={busy || !isTotpCode(code)}>
                  {busy ? 'Verifying...' : 'Verify authenticator code'}
                </Button>
              </form>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3 border-t pt-4">
          {session ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void leave()}>
              Sign out and clear this page
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/staff/login">Return to staff login</Link>
            </Button>
          )}
          {allowedAccount && !privateEnrollment && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                handoffAttempted.current = false
                resetWorkspaceHandoff()
                setHandoff('idle')
                setRefresh((value) => value + 1)
                refreshAccess()
              }}
            >
              Recheck securely
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Keep this setup private. MFA is not leaked-password protection; the
          no-real-user-onboarding gate remains in effect.
        </p>
      </CardContent>
    </Card>
  )
}
