'use client'

import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import {
  BeneficiaryStepUpError,
  changeStepUpPin,
  getBeneficiaryStepUpStatus,
  setStepUpPin,
  verifyBeneficiaryStepUp,
} from '@/lib/auth/beneficiary-step-up'
import { STEP_UP_PIN_RULE_MESSAGE, type StepUpPinState } from '@pathways/shared'
import { useEffect, useRef, useState } from 'react'
import { currentContinuation } from '../own-password-operation'
import {
  type InvalidField,
  OwnStepUpPinDialog,
  type PinProof,
  type PinStep,
  type PinValues,
} from './own-step-up-pin-dialog'

/**
 * Beneficiary access PIN (cr-pathways-beneficiary-step-up-pin). Setting a first PIN needs
 * a fresh authenticator code; changing it needs the current PIN or an authenticator code.
 * The server enforces both. PIN values stay in the dialog, which clears them before any request.
 */
export function OwnStepUpPinForm() {
  const { session } = useSession()
  const { profile, access } = useCurrentRole()
  const owner = JSON.stringify([session?.user.id, profile?.organizationId, profile?.userId, access])
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
      access === 'ready'
  }
  const [pinState, setPinState] = useState<StepUpPinState | null>(null)
  const [step, setStep] = useState<PinStep | null>(null)
  const [proof, setProof] = useState<PinProof>('authenticator')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [invalid, setInvalid] = useState<{ field: InvalidField; token: number } | null>(null)
  const [reload, setReload] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const inFlight = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: owner and reload re-read the server state.
  useEffect(() => {
    const controller = new AbortController()
    setPinState(null)
    setStep(null)
    setLoadFailed(false)
    setNotice('Loading PIN status...')
    getBeneficiaryStepUpStatus(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return
        setPinState(status.pinState)
        setNotice('')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setLoadFailed(true)
        setNotice('PIN status could not be loaded. Try again.')
      })
    return () => controller.abort()
  }, [owner, reload])

  // Move focus to the field the current error describes (re-runs for a repeated error).
  useEffect(() => {
    if (!invalid) return
    document.getElementById(`own-${invalid.field}`)?.focus()
  }, [invalid])

  const flag = (field: InvalidField, message: string) => {
    setNotice(message)
    setInvalid((previous) => ({ field, token: (previous?.token ?? 0) + 1 }))
  }
  // Starts over at the chosen proof, keeping the message that explains why when there is one.
  const startProof = (next: PinProof, message = '') => {
    setProof(next)
    setStep(next === 'pin' ? 'pin' : 'code')
    setInvalid(null)
    setNotice(message)
  }

  const verifyCode = async (code: string) => {
    const isCurrent = captureCurrent()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice('')
    setInvalid(null)
    const { step: run } = currentContinuation(isCurrent)
    try {
      await run(() => verifyBeneficiaryStepUp(code))
      if (isCurrent()) setStep('pin')
    } catch (error) {
      if (!isCurrent()) return
      flag(
        'code',
        error instanceof BeneficiaryStepUpError && error.failure === 'rejected'
          ? 'The code was not accepted. Try the next authenticator code.'
          : 'Your code could not be verified. Check your connection and try again.',
      )
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  const submit = async ({ newPin, currentPin }: PinValues) => {
    const isCurrent = captureCurrent()
    if (inFlight.current || !pinState) return
    inFlight.current = true
    setBusy(true)
    setNotice('')
    setInvalid(null)
    const { step: run } = currentContinuation(isCurrent)
    try {
      if (pinState === 'NONE') await run(() => setStepUpPin(newPin))
      else await run(() => changeStepUpPin(newPin, proof === 'pin' ? currentPin : undefined))
      if (!isCurrent()) return
      setStep(null)
      setNotice(pinState === 'NONE' ? 'PIN set.' : 'PIN changed. Other sessions must verify again.')
      setPinState('SET')
    } catch (error) {
      if (!isCurrent()) return
      if (!(error instanceof BeneficiaryStepUpError) || error.failure === 'unavailable') {
        setNotice('The PIN could not be saved. Check your connection and try again.')
      } else if (error.failure === 'locked') {
        setPinState('LOCKED')
        startProof('authenticator', error.message)
      } else if (error.message === STEP_UP_PIN_RULE_MESSAGE) {
        flag('newPin', error.message)
      } else if (error.message === 'Incorrect PIN' && proof === 'pin') {
        flag('currentPin', error.message)
      } else if (error.failure === 'rejected' && proof === 'authenticator') {
        // The authenticator check went stale while the dialog was open, so ask for a new code.
        startProof('authenticator', error.message)
      } else setNotice(error.message)
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {pinState ? (
        <>
          <p className="text-sm text-muted-foreground">
            {pinState === 'NONE'
              ? 'No PIN is set. Confirm your authenticator code, then choose a PIN to reopen Beneficiary details without your authenticator for 15 minutes.'
              : pinState === 'LOCKED'
                ? 'Your PIN is locked. Confirm your authenticator code, then choose a new PIN.'
                : 'Your authenticator stays the primary check. Confirm your authenticator code or current PIN, then choose a new PIN.'}
          </p>
          <Button
            disabled={busy}
            onClick={() => startProof('authenticator')}
            type="button"
            variant="outline"
          >
            {pinState === 'NONE' ? 'Set PIN' : 'Change PIN'}
          </Button>
          {step && (
            <OwnStepUpPinDialog
              step={step}
              proof={proof}
              pinState={pinState}
              busy={busy}
              notice={notice}
              invalid={invalid?.field ?? null}
              onVerify={(code) => void verifyCode(code)}
              onSubmit={(values) => void submit(values)}
              onInvalid={flag}
              onChooseProof={startProof}
              onClose={() => {
                setStep(null)
                setNotice('')
                setInvalid(null)
              }}
            />
          )}
        </>
      ) : loadFailed ? (
        <Button onClick={() => setReload((value) => value + 1)} type="button" variant="outline">
          Reload PIN status
        </Button>
      ) : null}
      {/* Persistent live region: only its text changes. */}
      <output aria-atomic="true" aria-live="polite" className="block text-sm">
        {step ? '' : notice}
      </output>
    </div>
  )
}
