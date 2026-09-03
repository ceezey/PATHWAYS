'use client'

import { ArrowLeft, KeyRound, Loader2, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { DialogShell } from '@/components/pathways/dialog-shell'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { writeBeneficiaryAccess } from '@/lib/auth/beneficiary-step-up'

export const BeneficiaryAccessGate = ({ onVerified }: { onVerified: () => void }) => {
  const router = useRouter()
  const { role } = usePrototypeRole()
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'locked'>('idle')
  const [message, setMessage] = useState('Enter your beneficiary-module access PIN.')
  const verifyButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (status === 'error' && pin.length >= 4) {
      verifyButtonRef.current?.focus()
    }
  }, [pin, status])

  const verify = async () => {
    if (pin.length < 4 || status === 'loading') {
      return
    }

    setStatus('loading')
    setMessage('Verifying beneficiary access...')

    try {
      const response = await fetch('/api/beneficiary-step-up/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, role }),
      })
      const result = (await response.json()) as {
        ok?: boolean
        expiresAt?: string
        message?: string
      }

      if (!response.ok || !result.ok) {
        setStatus(response.status === 429 ? 'locked' : 'error')
        setMessage(result.message ?? 'The PIN could not be verified. Check the PIN and try again.')
        setPin('')
        return
      }

      writeBeneficiaryAccess(role, result.expiresAt)
      onVerified()
    } catch {
      setStatus('error')
      setMessage(
        'The beneficiary access service could not be reached. Check your connection and try again.',
      )
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <Dialog open onOpenChange={(open) => !open && router.push('/dashboard')}>
        <DialogShell
          title="Verify beneficiary module access"
          description="Sensitive beneficiary records are hidden until this short-lived step-up check succeeds."
        >
          <div className="space-y-5">
            <output
              aria-atomic="true"
              aria-live="polite"
              className="block rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm leading-6 text-warning"
            >
              {/* TODO(AUTH): Replace prototype beneficiary PIN verification with organization-approved step-up authentication. */}
              {/* TODO(SECURITY): Store step-up verification state securely and enforce it server-side. */}
              {/* TODO(AUDIT): Record beneficiary-module access and failed verification attempts. */}
              {message}
            </output>
            <div className="space-y-2">
              <Label htmlFor="beneficiary-step-up-pin">Beneficiary access PIN</Label>
              <Input
                id="beneficiary-step-up-pin"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter PIN"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void verify()
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Verification is scoped to beneficiary routes and clears when the role changes or the
                session ends.
              </p>
              <p className="text-xs font-medium text-foreground">Client demonstration PIN: 2468</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to dashboard
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPin('')
                  setStatus('idle')
                  setMessage('Enter your beneficiary-module access PIN.')
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reset
              </Button>
              <Button
                ref={verifyButtonRef}
                disabled={pin.length < 4 || status === 'loading' || status === 'locked'}
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
    </div>
  )
}
