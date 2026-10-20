'use client'

import { ArrowLeft, LoaderCircle, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { OtpInput } from '@/components/ui/otp-input'
import { isTotpCode } from '@/lib/auth/mfa-flow'
import { useMfaFlow } from '../hooks/use-mfa-flow'
import { MfaFactorPanel } from './mfa-factor-panel'
import { MfaVerifiedPanel } from './mfa-verified-panel'

export function MfaForm() {
  const {
    session,
    status,
    configured,
    access,
    accessError,
    accessRefreshing,
    handoff,
    accepted,
    leaving,
    busy,
    error,
    current,
    privateEnrollment,
    choices,
    verifiedFactors,
    factorId,
    setFactorId,
    code,
    setCode,
    codeFormVisible,
    enrollmentAttempted,
    enroll,
    verify,
    leave,
  } = useMfaFlow()

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
  // Setup sits in the footer row beside Login when no factor exists yet.
  const setupVisible = Boolean(
    configured &&
      !codePending &&
      session &&
      !accepted &&
      current &&
      current.status.aal !== 'aal2' &&
      !privateEnrollment &&
      current.factors.length === 0,
  )

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
            <div aria-hidden="true" className="h-4 w-3/4 animate-pulse rounded-md bg-secondary" />
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
          <MfaVerifiedPanel
            applicationAccessEnabled={current.status.applicationAccessEnabled}
            access={access}
            handoff={handoff}
            accessRefreshing={accessRefreshing}
            accessError={accessError}
          />
        ) : (
          <MfaFactorPanel
            current={current}
            privateEnrollment={privateEnrollment}
            choices={choices}
            verifiedFactors={verifiedFactors}
            factorId={factorId}
            setFactorId={setFactorId}
            code={code}
            setCode={setCode}
            busy={busy}
            codeFormVisible={codeFormVisible}
            verify={verify}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          {session || leaving ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              aria-label="Sign out and return to login"
              disabled={busy || leaving || codePending}
              onClick={() => void leave()}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Login
            </Button>
          ) : codePending ? (
            <Button type="button" variant="outline" className="gap-2" disabled>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Login
            </Button>
          ) : (
            <Button asChild variant="outline" className="gap-2">
              <Link href="/staff/login">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Login
              </Link>
            </Button>
          )}
          {setupVisible && (
            <Button
              type="button"
              className="ml-auto"
              disabled={busy || enrollmentAttempted}
              onClick={() => void enroll()}
            >
              Set up authenticator
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
