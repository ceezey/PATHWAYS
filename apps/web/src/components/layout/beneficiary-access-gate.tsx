'use client'

import { ArrowLeft, KeyRound, Loader2, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { LoadingSkeleton } from '@/components/pathways/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STEP_UP_PIN_UI_ENABLED } from '@/constants/feature-flags'
import {
  BeneficiaryStepUpError,
  PIN_LOCKED_MESSAGE,
  PIN_RULE_MESSAGE,
  type StepUpPinState,
  getBeneficiaryStepUpStatus,
  isAcceptableStepUpPin,
  setStepUpPin,
  unlockStepUpPin,
  verifyBeneficiaryStepUp,
  verifyStepUpPin,
} from '@/lib/auth/beneficiary-step-up'
import { STEP_UP_REQUIRED_EVENT } from '@/lib/auth/beneficiary-step-up-events'

const PROMPT = 'Enter the six-digit code from your authenticator app.'
const PIN_PROMPT = 'Enter your beneficiary access PIN.'
const OFFER_PROMPT =
  'Set a PIN to reopen Beneficiary details for 15 minutes without your authenticator. You can skip this.'
const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max)

type Method = 'totp' | 'pin' | 'offer'

/**
 * Beneficiary step-up prompt (cr-pathways-beneficiary-step-up, amended by
 * cr-pathways-beneficiary-step-up-pin). The API enforces freshness on every Beneficiary
 * detail request; this component only asks the user to re-verify with the authenticator
 * or, when the server reports an unlocked PIN, with that PIN. `preflight` checks server
 * status before rendering Beneficiary routes; elsewhere the prompt opens when the API
 * returns STEP_UP_REQUIRED. PINs live only in component state and are cleared after use.
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
  const [pinState, setPinState] = useState<StepUpPinState>('NONE')
  const [method, setMethod] = useState<Method>('totp')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState(PROMPT)
  const verifyButtonRef = useRef<HTMLButtonElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const pinInputRef = useRef<HTMLInputElement>(null)
  const pinConfirmRef = useRef<HTMLInputElement>(null)

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
        if (controller.signal.aborted) return
        setPinState(result.pinState)
        setPhase(result.fresh ? 'open' : 'required')
      })
      .catch(() => {
        if (!controller.signal.aborted) setPhase('unavailable')
      })
    return () => controller.abort()
  }, [preflight, statusRetry])

  useEffect(() => {
    const onRequired = () => {
      setCode('')
      setPin('')
      setPinConfirm('')
      setStatus('idle')
      setMethod('totp')
      setMessage(PROMPT)
      setOverlay(true)
      // PIN availability is advisory UI only; the authenticator is always offered.
      getBeneficiaryStepUpStatus()
        .then((result) => setPinState(result.pinState))
        .catch(() => {
          // Without a confirmed PIN state, fall back to the always-available authenticator.
          setPinState('NONE')
          setPin('')
          setMethod('totp')
          setMessage(PROMPT)
        })
    }
    window.addEventListener(STEP_UP_REQUIRED_EVENT, onRequired)
    return () => window.removeEventListener(STEP_UP_REQUIRED_EVENT, onRequired)
  }, [])

  useEffect(() => {
    if (status === 'error' && method === 'totp' && code.length === 6) {
      verifyButtonRef.current?.focus()
    }
  }, [code, method, status])

  const clearSecrets = () => {
    setCode('')
    setPin('')
    setPinConfirm('')
  }

  const choose = (next: Method, nextMessage?: string) => {
    clearSecrets()
    setStatus('idle')
    setMethod(next)
    setMessage(
      nextMessage ?? (next === 'pin' ? PIN_PROMPT : next === 'offer' ? OFFER_PROMPT : PROMPT),
    )
  }

  const reset = () => {
    choose(method)
    ;(method === 'pin' ? pinInputRef : codeInputRef).current?.focus()
  }

  const enter = () => {
    clearSecrets()
    setStatus('idle')
    setMethod('totp')
    setMessage(PROMPT)
    setOverlay(false)
    setPhase('open')
  }

  const verifyCode = async () => {
    if (code.length !== 6 || status === 'loading') return
    setStatus('loading')
    setMessage('Verifying with the server...')
    try {
      const result = await verifyBeneficiaryStepUp(code)
      let nextPinState = result.pinState
      if (nextPinState === 'LOCKED') {
        // A fresh authenticator verification unlocks the PIN; failure leaves it locked.
        nextPinState = await unlockStepUpPin().then(
          () => 'SET' as const,
          () => 'LOCKED' as const,
        )
      }
      setPinState(nextPinState)
      if (STEP_UP_PIN_UI_ENABLED && nextPinState === 'NONE') choose('offer')
      else enter()
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

  const verifyPin = async () => {
    if (pin.length < 6 || status === 'loading') return
    const submitted = pin
    setPin('')
    setStatus('loading')
    setMessage('Verifying with the server...')
    try {
      await verifyStepUpPin(submitted)
      enter()
    } catch (error) {
      if (error instanceof BeneficiaryStepUpError && error.failure === 'locked') {
        setPinState('LOCKED')
        choose('totp', PIN_LOCKED_MESSAGE)
        setStatus('error')
        codeInputRef.current?.focus()
        return
      }
      setStatus('error')
      setMessage(
        !(error instanceof BeneficiaryStepUpError) || error.failure === 'unavailable'
          ? 'The verification service could not be reached. Check your connection and try again.'
          : error.message === 'Incorrect PIN'
            ? 'Incorrect PIN. Personal details remain hidden.'
            : error.message,
      )
      pinInputRef.current?.focus()
    }
  }

  const savePin = async () => {
    if (status === 'loading') return
    const submitted = pin
    const confirmation = pinConfirm
    setPin('')
    setPinConfirm('')
    if (!isAcceptableStepUpPin(submitted)) {
      setStatus('error')
      setMessage(PIN_RULE_MESSAGE)
      pinInputRef.current?.focus()
      return
    }
    if (submitted !== confirmation) {
      setStatus('error')
      setMessage('The PINs do not match. Enter them again.')
      pinInputRef.current?.focus()
      return
    }
    setStatus('loading')
    setMessage('Saving your PIN...')
    try {
      await setStepUpPin(submitted)
      setPinState('SET')
      enter()
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof BeneficiaryStepUpError && error.failure !== 'unavailable'
          ? error.message
          : 'The PIN could not be saved. You can skip and set it later in My Profile.',
      )
      pinInputRef.current?.focus()
    }
  }

  const blocking = phase === 'required'
  const leave = () => {
    clearSecrets()
    setStatus('idle')
    setMethod('totp')
    setMessage(PROMPT)
    if (blocking) router.push('/dashboard')
    else setOverlay(false)
  }

  const methodChoice =
    STEP_UP_PIN_UI_ENABLED && method !== 'offer' && pinState === 'SET' ? (
      <fieldset className="flex flex-col gap-2 sm:flex-row">
        <legend className="sr-only">Verification method</legend>
        <Button
          aria-pressed={method === 'totp'}
          onClick={() => choose('totp')}
          type="button"
          variant={method === 'totp' ? 'default' : 'outline'}
        >
          <Smartphone className="mr-2 h-4 w-4" aria-hidden="true" />
          Use authenticator
        </Button>
        <Button
          aria-pressed={method === 'pin'}
          onClick={() => choose('pin')}
          type="button"
          variant={method === 'pin' ? 'default' : 'outline'}
        >
          <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
          Use PIN
        </Button>
      </fieldset>
    ) : null

  const pinInput = (id: string, label: string, value: string, set: (value: string) => void) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={id === 'beneficiary-step-up-pin-confirm' ? pinConfirmRef : pinInputRef}
        autoComplete="off"
        autoFocus={id !== 'beneficiary-step-up-pin-confirm'}
        inputMode="numeric"
        maxLength={12}
        type="password"
        value={value}
        onChange={(event) => set(digitsOnly(event.target.value, 12))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            // In the offer, Enter in New PIN moves to the confirmation until it is filled.
            if (method === 'offer' && id !== 'beneficiary-step-up-pin-confirm' && !pinConfirm) {
              pinConfirmRef.current?.focus()
            } else void (method === 'offer' ? savePin() : verifyPin())
          }
        }}
      />
    </div>
  )

  const prompt = (
    <Dialog open onOpenChange={(open) => !open && (method === 'offer' ? enter() : leave())}>
      <DialogShell
        title={
          method === 'offer' ? 'Set a beneficiary access PIN' : 'Verify beneficiary module access'
        }
        description={
          method === 'offer'
            ? 'Your authenticator stays the primary check. The PIN works only in this signed-in session window.'
            : STEP_UP_PIN_UI_ENABLED
              ? 'Beneficiary personal details require a recent authenticator or PIN verification. The server checks it on every request.'
              : 'Beneficiary personal details require a recent authenticator verification. The server checks it on every request.'
        }
      >
        <div className="space-y-5">
          <output
            aria-atomic="true"
            aria-live="polite"
            className="block rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm leading-6 text-warning"
          >
            {message}
          </output>
          {methodChoice}
          {STEP_UP_PIN_UI_ENABLED && pinState === 'LOCKED' && method === 'totp' ? (
            <p className="text-sm text-muted-foreground">{PIN_LOCKED_MESSAGE}</p>
          ) : null}
          {method === 'totp' ? (
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
                onChange={(event) => setCode(digitsOnly(event.target.value, 6))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void verifyCode()
                  }
                }}
              />
            </div>
          ) : method === 'pin' ? (
            pinInput('beneficiary-step-up-pin', 'Beneficiary access PIN', pin, setPin)
          ) : (
            <>
              {pinInput('beneficiary-step-up-new-pin', 'New PIN', pin, setPin)}
              {pinInput(
                'beneficiary-step-up-pin-confirm',
                'Confirm new PIN',
                pinConfirm,
                setPinConfirm,
              )}
              <p className="text-sm text-muted-foreground">{PIN_RULE_MESSAGE}</p>
            </>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {method === 'offer' ? (
              <>
                <Button type="button" variant="ghost" onClick={enter}>
                  Skip for now
                </Button>
                <Button
                  disabled={pin.length < 6 || pinConfirm.length < 6 || status === 'loading'}
                  onClick={savePin}
                  type="button"
                >
                  {status === 'loading' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Save PIN
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={leave}>
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  {blocking ? 'Back to dashboard' : 'Not now'}
                </Button>
                <Button type="button" variant="outline" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Reset
                </Button>
                {method === 'totp' ? (
                  <Button
                    ref={verifyButtonRef}
                    disabled={code.length !== 6 || status === 'loading'}
                    onClick={verifyCode}
                    type="button"
                  >
                    {status === 'loading' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Verify and enter
                  </Button>
                ) : (
                  <Button
                    disabled={pin.length < 6 || status === 'loading'}
                    onClick={verifyPin}
                    type="button"
                  >
                    {status === 'loading' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Verify PIN
                  </Button>
                )}
              </>
            )}
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
    return <div className="flex min-h-state items-center justify-center p-6">{prompt}</div>
  return (
    <>
      {children}
      {overlay ? prompt : null}
    </>
  )
}
