'use client'

import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { OtpInput } from '@/components/ui/otp-input'
import {
  STEP_UP_PIN_RULE_MESSAGE,
  type StepUpPinState,
  isAcceptableStepUpPin,
} from '@pathways/shared'

export type PinStep = 'code' | 'pin'
export type PinProof = 'authenticator' | 'pin'
export type PinField = 'newPin' | 'confirmPin' | 'currentPin'
export type InvalidField = PinField | 'code'
export type PinValues = { newPin: string; currentPin: string }

type Props = {
  step: PinStep
  proof: PinProof
  pinState: StepUpPinState
  busy: boolean
  notice: string
  invalid: InvalidField | null
  onVerify: (code: string) => void
  onSubmit: (values: PinValues) => void
  onInvalid: (field: PinField, message: string) => void
  onChooseProof: (proof: PinProof) => void
  onClose: () => void
}

const empty = { currentPin: '', newPin: '', confirmPin: '' }
const focusField = (field: PinField) => document.getElementById(`own-${field}`)?.focus()

/**
 * Two-step modal for My Profile: confirm with the authenticator or current PIN, then the new PIN.
 * PINs live only in this component's state and are cleared before any request.
 */
export function OwnStepUpPinDialog({
  step,
  proof,
  pinState,
  busy,
  notice,
  invalid,
  onVerify,
  onSubmit,
  onInvalid,
  onChooseProof,
  onClose,
}: Props) {
  const [code, setCode] = useState('')
  const [pins, setPins] = useState(empty)
  const isFirstPin = pinState === 'NONE'
  const spinner = busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null
  const verify = (digits: string) => {
    if (digits.length !== 6 || busy) return
    onVerify(digits)
    setCode('')
  }
  const chooseProof = (next: PinProof) => {
    setPins(empty)
    onChooseProof(next)
  }
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Client checks send nothing; only the fields that must be re-entered are cleared.
    if (!isAcceptableStepUpPin(pins.newPin)) {
      setPins({ ...pins, newPin: '', confirmPin: '' })
      onInvalid('newPin', STEP_UP_PIN_RULE_MESSAGE)
      return
    }
    if (pins.newPin !== pins.confirmPin) {
      setPins({ ...pins, confirmPin: '' })
      onInvalid('confirmPin', 'The new PINs do not match.')
      return
    }
    setPins(empty)
    onSubmit({ newPin: pins.newPin, currentPin: pins.currentPin })
  }
  const pinField = (name: PinField, label: string, next?: PinField) => (
    <div key={name} className="space-y-2">
      <Label htmlFor={`own-${name}`}>{label}</Label>
      <OtpInput
        id={`own-${name}`}
        label={label}
        masked
        className="justify-center"
        autoFocus={name === (proof === 'pin' ? 'currentPin' : 'newPin')}
        disabled={busy}
        invalid={invalid === name}
        describedBy={
          invalid === name
            ? `own-pin-notice${name === 'newPin' ? ' own-pin-rule' : ''}`
            : name === 'newPin'
              ? 'own-pin-rule'
              : undefined
        }
        value={pins[name]}
        onChange={(value) => {
          setPins((current) => ({ ...current, [name]: value }))
          if (next && value.length === 6) focusField(next)
        }}
      />
    </div>
  )
  const cancel = (
    <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
      Cancel
    </Button>
  )
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogShell
        title={
          step === 'code'
            ? 'Verify your authenticator'
            : isFirstPin
              ? 'Choose a PIN'
              : 'Choose a new PIN'
        }
        description={
          step === 'code'
            ? `Enter the six-digit code from your authenticator app to ${isFirstPin ? 'set' : 'change'} your PIN.`
            : proof === 'pin'
              ? 'Enter your current PIN, then enter and confirm a new PIN.'
              : 'Your authenticator code was accepted. Enter and confirm your PIN.'
        }
      >
        {/* Persistent live region: only its text changes. */}
        <output
          aria-atomic="true"
          aria-live="polite"
          className={
            notice
              ? 'block rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm leading-6 text-warning'
              : 'sr-only'
          }
          id="own-pin-notice"
        >
          {notice}
        </output>
        {step === 'code' ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="own-code">Authenticator code</Label>
              <OtpInput
                id="own-code"
                label="Authenticator code"
                className="justify-center"
                autoFocus
                disabled={busy}
                invalid={invalid === 'code'}
                describedBy={invalid === 'code' ? 'own-pin-notice' : undefined}
                value={code}
                onChange={(next) => {
                  setCode(next)
                  verify(next)
                }}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {pinState === 'SET' && (
                <Button
                  className="sm:mr-auto"
                  disabled={busy}
                  onClick={() => chooseProof('pin')}
                  type="button"
                  variant="outline"
                >
                  Use current PIN
                </Button>
              )}
              {cancel}
              <Button
                disabled={code.length !== 6 || busy}
                onClick={() => verify(code)}
                type="button"
              >
                {spinner ?? <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />}
                Verify
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            {proof === 'pin' && pinField('currentPin', 'Current PIN', 'newPin')}
            {pinField('newPin', 'New PIN', 'confirmPin')}
            {pinField('confirmPin', 'Confirm new PIN')}
            <p className="text-sm text-muted-foreground" id="own-pin-rule">
              {STEP_UP_PIN_RULE_MESSAGE}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {proof === 'pin' && (
                <Button
                  className="sm:mr-auto"
                  disabled={busy}
                  onClick={() => chooseProof('authenticator')}
                  type="button"
                  variant="outline"
                >
                  Use authenticator code
                </Button>
              )}
              {cancel}
              <Button
                disabled={
                  busy ||
                  pins.newPin.length !== 6 ||
                  pins.confirmPin.length !== 6 ||
                  (proof === 'pin' && pins.currentPin.length !== 6)
                }
                type="submit"
              >
                {spinner}
                {busy ? 'Saving PIN...' : isFirstPin ? 'Set PIN' : 'Change PIN'}
              </Button>
            </div>
          </form>
        )}
      </DialogShell>
    </Dialog>
  )
}
