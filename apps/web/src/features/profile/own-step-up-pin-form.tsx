'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSession } from '@/hooks/use-session'
import {
  BeneficiaryStepUpError,
  PIN_RULE_MESSAGE,
  type StepUpPinState,
  changeStepUpPin,
  getBeneficiaryStepUpStatus,
  isAcceptableStepUpPin,
  setStepUpPin,
  verifyBeneficiaryStepUp,
} from '@/lib/auth/beneficiary-step-up'
import { useEffect, useRef, useState } from 'react'
import { currentContinuation } from './own-password-operation'

type Proof = 'pin' | 'authenticator'
const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Beneficiary access PIN (cr-pathways-beneficiary-step-up-pin). Setting a first PIN needs
 * a fresh authenticator code; changing it needs the current PIN or an authenticator code.
 * The server enforces both. PIN values are read from the form once and the form is reset.
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
  const [proof, setProof] = useState<Proof>('pin')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const inFlight = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: owner and reload re-read the server state.
  useEffect(() => {
    const controller = new AbortController()
    setPinState(null)
    getBeneficiaryStepUpStatus(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return
        setPinState(status.pinState)
        if (status.pinState === 'LOCKED') setProof('authenticator')
      })
      .catch(() => {
        if (!controller.signal.aborted) setNotice('PIN status could not be loaded. Try again.')
      })
    return () => controller.abort()
  }, [owner, reload])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const isCurrent = captureCurrent()
    if (inFlight.current || !pinState) return
    const form = event.currentTarget
    const values = new FormData(form)
    form.reset()
    const newPin = field(values, 'newPin')
    const confirmPin = field(values, 'confirmPin')
    const currentPin = field(values, 'currentPin')
    const authenticatorCode = field(values, 'authenticatorCode')
    const usesAuthenticator = pinState !== 'SET' || proof === 'authenticator'
    if (!isAcceptableStepUpPin(newPin)) {
      setNotice(PIN_RULE_MESSAGE)
      return
    }
    if (newPin !== confirmPin) {
      setNotice('The new PINs do not match.')
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice('')
    const { step } = currentContinuation(isCurrent)
    try {
      if (pinState === 'NONE') {
        await step(() => verifyBeneficiaryStepUp(authenticatorCode))
        await step(() => setStepUpPin(newPin))
      } else {
        await step(() =>
          changeStepUpPin(newPin, usesAuthenticator ? { authenticatorCode } : { currentPin }),
        )
      }
      if (!isCurrent()) return
      setNotice(pinState === 'NONE' ? 'PIN set.' : 'PIN changed. Other sessions must verify again.')
      setPinState('SET')
      setProof('pin')
    } catch (error) {
      if (!isCurrent()) return
      if (error instanceof BeneficiaryStepUpError && error.failure === 'locked') {
        setPinState('LOCKED')
        setProof('authenticator')
      }
      setNotice(
        error instanceof BeneficiaryStepUpError && error.failure !== 'unavailable'
          ? error.message
          : 'The PIN could not be saved. Check your connection and try again.',
      )
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  if (!pinState) {
    return (
      <div className="space-y-3">
        <output className="block text-sm">{notice || 'Loading PIN status...'}</output>
        {notice && (
          <Button onClick={() => setReload((value) => value + 1)} type="button" variant="outline">
            Reload PIN status
          </Button>
        )}
      </div>
    )
  }

  const usesAuthenticator = pinState !== 'SET' || proof === 'authenticator'
  const pinField = (name: string, label: string) => (
    <div key={name} className="space-y-2">
      <label className="text-sm font-medium" htmlFor={`own-${name}`}>
        {label}
      </label>
      <Input
        autoComplete="off"
        disabled={busy}
        id={`own-${name}`}
        inputMode="numeric"
        maxLength={12}
        name={name}
        pattern="[0-9]*"
        required
        type="password"
      />
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {pinState === 'NONE'
          ? 'No PIN is set. Set one with a fresh authenticator code to reopen Beneficiary details without your authenticator for 15 minutes.'
          : pinState === 'LOCKED'
            ? 'Your PIN is locked. Use your authenticator to set a new PIN.'
            : 'Your authenticator stays the primary check. Change the PIN with the current PIN or an authenticator code.'}
      </p>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        {pinState === 'SET' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Confirm with</legend>
            {(
              [
                ['pin', 'Use current PIN'],
                ['authenticator', 'Use authenticator code'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  checked={proof === value}
                  disabled={busy}
                  name="proof"
                  onChange={() => setProof(value)}
                  type="radio"
                  value={value}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        {usesAuthenticator ? (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="own-authenticatorCode">
              Authenticator code
            </label>
            <Input
              autoComplete="one-time-code"
              disabled={busy}
              id="own-authenticatorCode"
              inputMode="numeric"
              maxLength={6}
              name="authenticatorCode"
              required
              type="text"
            />
          </div>
        ) : (
          pinField('currentPin', 'Current PIN')
        )}
        {pinField('newPin', 'New PIN')}
        {pinField('confirmPin', 'Confirm new PIN')}
        <p className="text-sm text-muted-foreground">{PIN_RULE_MESSAGE}</p>
        <Button disabled={busy} type="submit">
          {busy ? 'Saving PIN...' : pinState === 'NONE' ? 'Set PIN' : 'Change PIN'}
        </Button>
      </form>
      {notice && <output className="block text-sm">{notice}</output>}
    </div>
  )
}
