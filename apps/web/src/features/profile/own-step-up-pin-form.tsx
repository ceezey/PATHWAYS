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
type PinField = 'newPin' | 'confirmPin' | 'currentPin' | 'authenticatorCode'
const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Beneficiary access PIN (cr-pathways-beneficiary-step-up-pin). Setting a first PIN needs
 * a fresh authenticator code; changing it needs the current PIN or an authenticator code.
 * The server enforces both. PIN values are read from the form once; the form is reset before
 * any request, and a client-side rule error clears only the fields that must be re-entered.
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
  const [invalid, setInvalid] = useState<{ field: PinField; token: number } | null>(null)
  const [reload, setReload] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: owner and reload re-read the server state.
  useEffect(() => {
    const controller = new AbortController()
    setPinState(null)
    setLoadFailed(false)
    setNotice('Loading PIN status...')
    getBeneficiaryStepUpStatus(controller.signal)
      .then((status) => {
        if (controller.signal.aborted) return
        setPinState(status.pinState)
        setNotice('')
        if (status.pinState === 'LOCKED') setProof('authenticator')
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
    const element = formRef.current?.elements.namedItem(invalid.field)
    if (element instanceof HTMLInputElement) element.focus()
  }, [invalid])

  const flag = (field: PinField, message: string) => {
    setNotice(message)
    setInvalid((previous) => ({ field, token: (previous?.token ?? 0) + 1 }))
  }
  const clear = (form: HTMLFormElement, names: readonly PinField[]) => {
    for (const name of names) {
      const element = form.elements.namedItem(name)
      if (element instanceof HTMLInputElement) element.value = ''
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const isCurrent = captureCurrent()
    if (inFlight.current || !pinState) return
    const form = event.currentTarget
    const values = new FormData(form)
    const newPin = field(values, 'newPin')
    const confirmPin = field(values, 'confirmPin')
    const currentPin = field(values, 'currentPin')
    const authenticatorCode = field(values, 'authenticatorCode')
    const usesAuthenticator = pinState !== 'SET' || proof === 'authenticator'
    // Client checks send nothing; only the fields that must be re-entered are cleared.
    if (!isAcceptableStepUpPin(newPin)) {
      clear(form, ['newPin', 'confirmPin'])
      flag('newPin', PIN_RULE_MESSAGE)
      return
    }
    if (newPin !== confirmPin) {
      clear(form, ['confirmPin'])
      flag('confirmPin', 'The new PINs do not match.')
      return
    }
    // Every submitted secret leaves the DOM before the request starts.
    form.reset()
    inFlight.current = true
    setBusy(true)
    setNotice('')
    setInvalid(null)
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
      if (!(error instanceof BeneficiaryStepUpError) || error.failure === 'unavailable') {
        setNotice('The PIN could not be saved. Check your connection and try again.')
      } else if (error.failure === 'locked') {
        setPinState('LOCKED')
        setProof('authenticator')
        flag('authenticatorCode', error.message)
      } else if (error.message === 'Incorrect PIN' && !usesAuthenticator) {
        flag('currentPin', error.message)
      } else if (error.message === PIN_RULE_MESSAGE) {
        flag('newPin', error.message)
      } else if (usesAuthenticator) {
        flag('authenticatorCode', error.message)
      } else setNotice(error.message)
    } finally {
      inFlight.current = false
      if (isCurrent()) setBusy(false)
    }
  }

  const usesAuthenticator = pinState !== 'SET' || proof === 'authenticator'
  const describedBy = (name: PinField) =>
    invalid?.field === name
      ? `own-pin-notice${name === 'newPin' ? ' own-pin-rule' : ''}`
      : name === 'newPin'
        ? 'own-pin-rule'
        : undefined
  const pinField = (name: PinField, label: string) => (
    <div key={name} className="space-y-2">
      <label className="text-sm font-medium" htmlFor={`own-${name}`}>
        {label}
      </label>
      <Input
        aria-describedby={describedBy(name)}
        aria-invalid={invalid?.field === name || undefined}
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
      {pinState ? (
        <>
          <p className="text-sm text-muted-foreground">
            {pinState === 'NONE'
              ? 'No PIN is set. Set one with a fresh authenticator code to reopen Beneficiary details without your authenticator for 15 minutes.'
              : pinState === 'LOCKED'
                ? 'Your PIN is locked. Use your authenticator to set a new PIN.'
                : 'Your authenticator stays the primary check. Change the PIN with the current PIN or an authenticator code.'}
          </p>
          <form ref={formRef} className="space-y-4" onSubmit={(event) => void submit(event)}>
            {pinState === 'SET' && (
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">Confirm with</legend>
                {(
                  [
                    ['pin', 'Use current PIN'],
                    ['authenticator', 'Use authenticator code'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                  >
                    <input
                      checked={proof === value}
                      className="h-4 w-4"
                      disabled={busy}
                      name="proof"
                      onChange={() => {
                        setProof(value)
                        setInvalid(null)
                      }}
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
                  aria-describedby={describedBy('authenticatorCode')}
                  aria-invalid={invalid?.field === 'authenticatorCode' || undefined}
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
            <p className="text-sm text-muted-foreground" id="own-pin-rule">
              {PIN_RULE_MESSAGE}
            </p>
            <Button disabled={busy} type="submit">
              {busy ? 'Saving PIN...' : pinState === 'NONE' ? 'Set PIN' : 'Change PIN'}
            </Button>
          </form>
        </>
      ) : loadFailed ? (
        <Button onClick={() => setReload((value) => value + 1)} type="button" variant="outline">
          Reload PIN status
        </Button>
      ) : null}
      {/* Persistent live region: only its text changes. */}
      <output aria-atomic="true" aria-live="polite" className="block text-sm" id="own-pin-notice">
        {notice}
      </output>
    </div>
  )
}
