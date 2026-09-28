'use client'

import { ArrowLeft, KeyRound, Loader2, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { LoadingSkeleton } from '@/components/pathways/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  BeneficiaryStepUpError,
  getBeneficiaryStepUpStatus,
  verifyBeneficiaryStepUp,
} from '@/lib/auth/beneficiary-step-up'
import { STEP_UP_REQUIRED_EVENT } from '@/lib/auth/beneficiary-step-up-events'

const PROMPT = 'Enter the six-digit code from your authenticator app.'

/**
 * Beneficiary step-up prompt (cr-pathways-beneficiary-step-up). The API enforces
 * freshness on every Beneficiary detail request; this component only asks the
 * user to re-verify MFA. `preflight` checks server status before rendering
 * Beneficiary routes; elsewhere the prompt opens when the API returns
 * STEP_UP_REQUIRED.
 */
export const BeneficiaryAccessGate = ({
  children,
  preflight,
}: {
  children: ReactNode
  preflight: boolean
}) => {
  const router = useRouter()
  const [phase, setPhase] = useState<'checking' | 'required' | 'unavailable' | 'open'>(
    preflight ? 'checking' : 'open',
  )
  const [overlay, setOverlay] = useState(false)
  const [statusRetry, setStatusRetry] = useState(0)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState(PROMPT)
  const verifyButtonRef = useRef<HTMLButtonElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: statusRetry re-runs the server check on demand.
  useEffect(() => {
    if (!preflight) {
      setPhase('open')
      return
    }
    const controller = new AbortController()
    setPhase('checking')
    getBeneficiaryStepUpStatus(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPhase(result.fresh ? 'open' : 'required')
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhase('unavailable')
      })
    return () => controller.abort()
  }, [preflight, statusRetry])

  useEffect(() => {
    const onRequired = () => {
      setCode('')
      setStatus('idle')
      setMessage(PROMPT)
      setOverlay(true)
    }
    window.addEventListener(STEP_UP_REQUIRED_EVENT, onRequired)
    return () => window.removeEventListener(STEP_UP_REQUIRED_EVENT, onRequired)
  }, [])

  useEffect(() => {
    if (status === 'error' && code.length === 6) {
      verifyButtonRef.current?.focus()
    }
  }, [code, status])

  const reset = () => {
    setCode('')
    setStatus('idle')
    setMessage(PROMPT)
    codeInputRef.current?.focus()
  }

  const verify = async () => {
    if (code.length !== 6 || status === 'loading') {
      return
    }
    setStatus('loading')
    setMessage('Verifying with the server...')
    try {
      await verifyBeneficiaryStepUp(code)
      reset()
      setOverlay(false)
      setPhase('open')
    } catch (error) {
      setStatus('error')
      if (error instanceof BeneficiaryStepUpError && error.failure === 'rejected') {
        setCode('')
        setMessage(
          'The code was not accepted. Personal details remain hidden; try the next authenticator code.',
        )
        // The verify button disables with an empty code; keep focus in the dialog.
        codeInputRef.current?.focus()
      } else {
        setMessage(
          'The verification service could not be reached. Check your connection and try again.',
        )
      }
    }
  }

  const blocking = phase === 'required'
  const leave = () => {
    reset()
    if (blocking) router.push('/dashboard')
    else setOverlay(false)
  }

  const prompt = (
    <Dialog open onOpenChange={(open) => !open && leave()}>
      <DialogShell
        title="Verify beneficiary module access"
        description="Beneficiary personal details require a recent authenticator verification. The server checks it on every request."
      >
        <div className="space-y-5">
          <output
            aria-atomic="true"
            aria-live="polite"
            className="block rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm leading-6 text-warning"
          >
            {message}
          </output>
          <div className="space-y-2">
            <Label htmlFor="beneficiary-step-up-code">Authenticator code</Label>
            <Input
              id="beneficiary-step-up-code"
              ref={codeInputRef}
              autoComplete="one-time-code"
              autoFocus
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void verify()
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={leave}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {blocking ? 'Back to dashboard' : 'Not now'}
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
            <Button
              ref={verifyButtonRef}
              disabled={code.length !== 6 || status === 'loading'}
              onClick={verify}
              type="button"
            >
              {status === 'loading' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Verify and enter
            </Button>
          </div>
        </div>
      </DialogShell>
    </Dialog>
  )

  if (phase === 'checking') return <LoadingSkeleton className="py-2" />
  if (phase === 'unavailable')
    return (
      <section role="alert">
        <h2>Beneficiary verification unavailable</h2>
        <p>No personal details are shown. Your session has not been reset.</p>
        <button type="button" onClick={() => setStatusRetry((value) => value + 1)}>
          Retry verification check
        </button>
      </section>
    )
  if (blocking)
    return <div className="flex min-h-[70vh] items-center justify-center p-6">{prompt}</div>
  return (
    <>
      {children}
      {overlay ? prompt : null}
    </>
  )
}
