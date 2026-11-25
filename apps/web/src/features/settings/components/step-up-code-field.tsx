'use client'

import { useEffect, useState } from 'react'

import { Label } from '@/components/ui/label'
import { OtpInput } from '@/components/ui/otp-input'
import {
  BeneficiaryStepUpError,
  getBeneficiaryStepUpStatus,
  verifyBeneficiaryStepUp,
} from '@/lib/auth/beneficiary-step-up'

const REJECTED = 'The code was not accepted. Try the next authenticator code.'
const UNREACHABLE =
  'The verification service could not be reached. Check your connection and try again.'

/**
 * The authenticator code a dialog asks for when none was used in the last 15 minutes.
 * `required` is set when the API itself asked for a code.
 */
export const useStepUpCode = (open: boolean, required: boolean) => {
  const [code, setCode] = useState('')
  // Pending until the status read settles; only a fresh answer lets the code be skipped.
  const [status, setStatus] = useState<'pending' | 'stale' | 'fresh'>('pending')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCode('')
    setError(null)
    setStatus('pending')
    if (!open) return
    const controller = new AbortController()
    getBeneficiaryStepUpStatus(controller.signal).then(
      (read) => setStatus(read.fresh && read.method === 'TOTP' ? 'fresh' : 'stale'),
      // A failed read leaves the field required.
      () => setStatus('stale'),
    )
    return () => controller.abort()
  }, [open])

  const needed = status === 'stale' || required
  const waiting = status === 'pending' && !required

  return {
    needed,
    code,
    setCode,
    checking,
    error,
    /** True while the status read is pending or the code field is empty or incomplete. */
    incomplete: waiting || (needed && code.length !== 6),
    /** Checks the typed code; true when the caller may go on. The code is single use, so it is cleared. */
    verify: async () => {
      if (!needed) return true
      setChecking(true)
      setError(null)
      try {
        await verifyBeneficiaryStepUp(code)
        setStatus('fresh')
        return true
      } catch (caught) {
        const unreachable =
          caught instanceof BeneficiaryStepUpError && caught.failure === 'unavailable'
        setError(unreachable ? UNREACHABLE : REJECTED)
        return false
      } finally {
        setChecking(false)
        setCode('')
      }
    },
  }
}

export const StepUpCodeField = ({ step }: { step: ReturnType<typeof useStepUpCode> }) =>
  step.needed ? (
    <div className="space-y-2">
      <Label htmlFor="step-up-code">Authenticator code</Label>
      <OtpInput
        id="step-up-code"
        label="Authenticator code"
        value={step.code}
        onChange={step.setCode}
        disabled={step.checking}
        invalid={Boolean(step.error)}
        describedBy={step.error ? 'step-up-code-error' : undefined}
      />
      {step.error ? (
        <p id="step-up-code-error" role="alert" className="text-sm text-danger">
          {step.error}
        </p>
      ) : null}
    </div>
  ) : null
