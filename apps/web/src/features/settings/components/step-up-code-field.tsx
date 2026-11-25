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
  // True until the status read says a fresh authenticator code exists; a failed read keeps it true.
  const [stale, setStale] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCode('')
    setError(null)
    setStale(true)
    if (!open) return
    const controller = new AbortController()
    getBeneficiaryStepUpStatus(controller.signal).then(
      (status) => setStale(!(status.fresh && status.method === 'TOTP')),
      () => undefined,
    )
    return () => controller.abort()
  }, [open])

  const needed = stale || required

  return {
    needed,
    code,
    setCode,
    checking,
    error,
    /** True while the code field is empty or incomplete. */
    incomplete: needed && code.length !== 6,
    /** Checks the typed code; true when the caller may go on. The code is single use, so it is cleared. */
    verify: async () => {
      if (!needed) return true
      setChecking(true)
      setError(null)
      try {
        await verifyBeneficiaryStepUp(code)
        setStale(false)
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
      />
    </div>
  ) : null
