'use client'

import { ArrowLeft, LoaderCircle, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OtpInput } from '@/components/ui/otp-input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import { webEnv } from '@/lib/env'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { AuthAccessError, type MfaStatus, parseMfaStatus, requestAuthJson } from './auth-access'
import { getQrImageSource, getVerifiedTotpFactors, isTotpCode, verifyTotpCode } from './mfa-flow'

interface FactorChoice {
  id: string
  status: string
  factor_type: string
}

export function MfaForm() {
  const router = useRouter()
  const { session, status, configured, refreshSession, signOut } = useSession()
  const { access, mfaStatus, accessError, accessRefreshing, refreshAccess, claimWorkspaceHandoff } =
    useCurrentRole()
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
    secret: string
  } | null>(null)
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const handoffAttempted = useRef(false)
  const handoffUser = useRef(session?.user.id)
  const [handoff, setHandoff] = useState<'idle' | 'opening' | 'stalled'>('idle')
  const [accepted, setAccepted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const currentUserId = session?.user.id
  const sessionSubject = currentUserId ?? null
  const allowedAccount = Boolean(currentUserId)
  const current =
    mfaStatus &&
    check?.token === token &&
    check?.refresh === refresh &&
    check.status.authUserId === mfaStatus.authUserId &&
    check.status.aal === mfaStatus.aal &&
    check.status.applicationAccessEnabled === mfaStatus.applicationAccessEnabled
      ? check
      : null
  const privateEnrollment = enrollment?.token === token ? enrollment : null
  const verifiedFactors = getVerifiedTotpFactors(current?.factors ?? [])
  const choices = verifiedFactors.length
    ? verifiedFactors
    : (current?.factors.filter((factor) => factor.factor_type === 'totp') ?? [])
  const codeFormVisible = Boolean(
    configured &&
      status !== 'loading' &&
      session &&
      !accepted &&
      current &&
      current.status.aal !== 'aal2' &&
      (privateEnrollment || choices.length > 0),
  )

  useEffect(() => {
    if (handoffUser.current !== session?.user.id) {
      handoffUser.current = session?.user.id
      handoffAttempted.current = false
      setHandoff('idle')
      setAccepted(false)
    }
  }, [session?.user.id])

  // Falls back to the code form if the API never confirms aal2 after an accepted code.
  useEffect(() => {
    if (!accepted) return
    const timeout = window.setTimeout(() => {
      setAccepted(false)
      setError(
        'Your code was accepted, but the session could not be confirmed. Reload this page or sign in again.',
      )
    }, 30_000)
    return () => window.clearTimeout(timeout)
  }, [accepted])

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
    if (!supabase || !token || !allowedAccount || !mfaStatus) return () => controller.abort()

    const inspect = async () => {
      try {
        // The provider owns routine MFA/profile verification. Only explicit
        // enrollment/verification actions below request a fresh MFA precondition.
        const result = mfaStatus
        if (!result || result.authUserId !== sessionSubject) return
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
  }, [allowedAccount, supabase, token, refresh, mfaStatus, sessionSubject])

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
      result.data.session.user.id !== currentUserId ||
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
        await requestAuthJson(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          '/auth/mfa/status',
          token,
          undefined,
          undefined,
          undefined,
          webEnv.NEXT_PUBLIC_API_BASE_URL,
        ),
      )
      if (fresh.authUserId !== currentUserId || fresh.aal !== 'aal1')
        throw new Error('No enrollment is needed.')
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
        secret: result.data.totp.secret,
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
        await requestAuthJson(
          webEnv.NEXT_PUBLIC_API_BASE_URL,
          '/auth/mfa/status',
          token,
          undefined,
          undefined,
          undefined,
          webEnv.NEXT_PUBLIC_API_BASE_URL,
        ),
      )
      if (fresh.authUserId !== currentUserId || fresh.aal !== 'aal1')
        throw new Error('Recheck the current session.')
      await verifyTotpCode(supabase.auth.mfa, selectedFactor, submittedCode, () =>
        assertCurrentSession(token, currentOperation),
      )
      setEnrollment(null)
      setAccepted(true)
      // Supabase emits the changed MFA session. The effect/API re-check decides
      // whether aal2 is verified; this success never unlocks business routes.
      await refreshSession()
      refreshAccess()
      setRefresh((value) => value + 1)
    } catch {
      if (operation.current === currentOperation) {
        setAccepted(false)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-submit fires only when the code changes.
  useEffect(() => {
    if (isTotpCode(code)) void verify()
  }, [code])

  // Keeps the current card in place during sign-out so no signed-out view flashes before login.
  const leave = async () => {
    ++operation.current
    setLeaving(true)
    setBusy(true)
    try {
      await signOut()
      router.replace('/staff/login')
    } catch {
      setLeaving(false)
      setAccepted(false)
      setEnrollment(null)
      setCode('')
      setCheck(null)
      setFactorId('')
      setError(
        'Sign-out could not be confirmed. Close this private browser window before continuing.',
      )
    } finally {
      setBusy(false)
    }
  }

  const loadingMessage =
    accepted && current?.status.aal !== 'aal2'
      ? 'Code accepted. Opening your workspace...'
      : current?.status.aal === 'aal2' && current.status.applicationAccessEnabled
        ? access === 'loading'
          ? 'Finding your authorized workspace...'
          : access === 'ready' && handoff !== 'stalled'
            ? 'Opening your dashboard...'
            : null
        : null
  // The OTP boxes show disabled while the session and factor check is still running.
  const codePending =
    configured &&
    !accepted &&
    !error &&
    !accessError &&
    (status === 'loading' || (Boolean(session) && !current))

  if (loadingMessage && !error) {
    return (
      <Card className="mx-auto w-full max-w-md" data-private="true">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <LoaderCircle
            className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          <output className="text-sm font-medium" aria-live="polite" aria-busy="true">
            {loadingMessage}
          </output>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto w-full max-w-md" data-private="true">
      <CardHeader>
        <ShieldCheck className="mb-2 h-9 w-9 text-primary" aria-hidden="true" />
        <CardTitle>Security check</CardTitle>
        <CardDescription>
          Verify multi-factor authentication before opening your authorized PATHWAYS workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {!configured ? (
          <p>The authentication connection is not configured.</p>
        ) : codePending ? (
          <div className="space-y-3" aria-busy="true">
            <label className="block text-sm" htmlFor="mfa-code">
              Six-digit authenticator code
            </label>
            <OtpInput
              id="mfa-code"
              length={6}
              label="Authenticator code"
              value=""
              onChange={() => {}}
              disabled
              className="justify-center"
            />
          </div>
        ) : !session ? (
          leaving ? null : (
            <p>Sign in before setting up MFA.</p>
          )
        ) : accepted && current?.status.aal !== 'aal2' ? (
          <output className="flex items-center gap-2" aria-live="polite" aria-busy="true">
            <LoaderCircle
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Code accepted. Opening your workspace...
          </output>
        ) : !current ? (
          accessError ? (
            <p role="alert">{accessError}</p>
          ) : (
            <output>Verification is blocked.</output>
          )
        ) : current.status.aal === 'aal2' ? (
          <div className="space-y-4">
            <output>MFA session verified by the API (aal2).</output>
            {!current.status.applicationAccessEnabled ? (
              <p>
                Application access is currently unavailable. Ask an administrator to review your
                active profile and workspace assignment.
              </p>
            ) : access === 'ready' ? (
              <div className="space-y-3">
                <p>Your identity and application access are verified.</p>
                {handoff === 'stalled' ? (
                  <div className="space-y-3">
                    <p role="alert">
                      Your sign-in check completed, but the workspace could not open. Retry opening
                      it below. Access will be checked again.
                    </p>
                    {!accessRefreshing && (
                      <Button asChild variant="outline">
                        <a href="/workspace">Retry opening workspace</a>
                      </Button>
                    )}
                  </div>
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
                    No authorized workspace is available. Ask an administrator to review your
                    access, or sign out. Reload this page after access is updated.
                  </output>
                ) : accessError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {accessError}
                  </p>
                ) : (
                  <output>
                    Workspace access is not available. Reload this page or ask the development
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
                <details className="space-y-2 rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Can&apos;t scan? Enter key manually
                  </summary>
                  <div className="space-y-2 pt-2">
                    <p className="text-sm text-muted-foreground">
                      Choose &quot;Enter a setup key&quot; in your authenticator app, select
                      time-based, and type this key. Keep it private like the QR code.
                    </p>
                    <code className="block select-all break-all rounded border bg-muted p-3 text-center font-mono text-sm tracking-wider">
                      {privateEnrollment.secret.replace(/(.{4})(?=.)/g, '$1 ')}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(privateEnrollment.secret)
                          .then(() => toast.success('Setup key copied.'))
                          .catch(() => toast.error('Could not copy the setup key.'))
                      }}
                    >
                      Copy key
                    </Button>
                  </div>
                </details>
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
            {codeFormVisible && (
              <form
                id="mfa-code-form"
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void verify()
                }}
              >
                <label className="block text-sm" htmlFor="mfa-code">
                  Six-digit authenticator code
                </label>
                <OtpInput
                  id="mfa-code"
                  length={6}
                  label="Authenticator code"
                  value={code}
                  onChange={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
                  disabled={busy}
                  className="justify-center"
                />
              </form>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {session || leaving ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              aria-label="Sign out and return to login"
              disabled={busy || leaving}
              onClick={() => void leave()}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Login
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/staff/login">Return to staff login</Link>
            </Button>
          )}
          {(codeFormVisible || codePending) && (
            <Button
              type="submit"
              form="mfa-code-form"
              className="ml-auto"
              disabled={codePending || busy || !isTotpCode(code)}
            >
              {busy ? 'Verifying...' : 'Verify'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Keep this setup private. MFA is not leaked-password protection; the workspace
          authorization is checked again on every protected request.
        </p>
      </CardContent>
    </Card>
  )
}
