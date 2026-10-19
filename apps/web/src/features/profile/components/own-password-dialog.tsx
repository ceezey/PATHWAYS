'use client'

import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OtpInput } from '@/components/ui/otp-input'

export type PasswordStep = 'code' | 'password'

type Props = {
  step: PasswordStep
  busy: boolean
  notice: string
  onVerify: (code: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

/** Two-step modal for My Profile: authenticator code first, then the new password. */
export function OwnPasswordDialog({ step, busy, notice, onVerify, onSubmit, onClose }: Props) {
  const [code, setCode] = useState('')
  const spinner = busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null
  const verify = (digits: string) => {
    if (digits.length !== 6 || busy) return
    onVerify(digits)
    setCode('')
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogShell
        title={step === 'code' ? 'Verify your authenticator' : 'Choose a new password'}
        description={
          step === 'code'
            ? 'Enter the six-digit code from your authenticator app to change your password.'
            : 'Your authenticator code was accepted. Enter and confirm your new password.'
        }
      >
        <div className="space-y-5">
          {notice && (
            <output
              aria-atomic="true"
              aria-live="polite"
              className="block rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm leading-6 text-warning"
            >
              {notice}
            </output>
          )}
          {step === 'code' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="own-password-code">Authenticator code</Label>
                <OtpInput
                  id="own-password-code"
                  label="Authenticator code"
                  className="justify-center"
                  autoFocus
                  disabled={busy}
                  value={code}
                  onChange={(next) => {
                    setCode(next)
                    verify(next)
                  }}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  disabled={code.length !== 6 || busy}
                  onClick={() => verify(code)}
                  type="button"
                >
                  {spinner ?? <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />}
                  Verify
                </Button>
              </div>
            </>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              {[
                ['password', 'New password'],
                ['confirmPassword', 'Confirm new password'],
              ].map(([name, label]) => (
                <div key={name} className="space-y-2">
                  <Label htmlFor={`own-${name}`}>{label}</Label>
                  <Input
                    autoComplete="new-password"
                    disabled={busy}
                    id={`own-${name}`}
                    name={name}
                    type="password"
                    required
                    maxLength={64}
                  />
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                Use 12 to 64 characters with uppercase, lowercase, a number, and a symbol.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
                <Button disabled={busy} type="submit">
                  {spinner}
                  {busy ? 'Changing password...' : 'Change password'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogShell>
    </Dialog>
  )
}
