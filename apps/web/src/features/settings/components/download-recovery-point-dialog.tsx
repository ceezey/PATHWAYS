'use client'

import type { RecoveryPointListItem } from '@pathways/shared'
import { useEffect, useState } from 'react'

import { ConfirmationDialog } from '@/components/pathways'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatRecoveryPointTime } from '../backup-recovery.utils'
import { StepUpCodeField, useStepUpCode } from './step-up-code-field'

const MIN_LENGTH = 12
const MAX_LENGTH = 128

/** Asks for the passphrase that locks the downloaded files, and for an authenticator code when needed. */
export const DownloadRecoveryPointDialog = ({
  point,
  pending,
  error,
  stepUpRequired,
  onConfirm,
  onOpenChange,
}: {
  point: RecoveryPointListItem | null
  pending: boolean
  error: string | null
  stepUpRequired: boolean
  onConfirm: (passphrase: string) => void
  onOpenChange: (open: boolean) => void
}) => {
  const [passphrase, setPassphrase] = useState('')
  const [again, setAgain] = useState('')
  const step = useStepUpCode(point !== null, stepUpRequired)
  // The passphrase is gone as soon as the dialog closes or another point opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the point changes
  useEffect(() => {
    setPassphrase('')
    setAgain('')
  }, [point?.id])
  const mismatch = again !== '' && again !== passphrase
  const message = step.error ?? error
  const valid =
    passphrase.length >= MIN_LENGTH && passphrase.length <= MAX_LENGTH && passphrase === again
  return (
    <ConfirmationDialog
      open={point !== null}
      // A running code check keeps its dialog, so its result is never lost.
      onOpenChange={(next) => step.checking || onOpenChange(next)}
      title={
        point
          ? `Download the recovery point from ${formatRecoveryPointTime(point)}?`
          : 'Download recovery point?'
      }
      description="The files are locked with a passphrase you choose. You need the same passphrase to open them later. PATHWAYS does not keep it."
      confirmLabel="Download"
      confirmVariant="default"
      confirmDisabled={pending || step.checking || !valid || step.incomplete}
      onConfirm={() =>
        void step.verify().then((ready) => {
          if (ready) onConfirm(passphrase)
        })
      }
    >
      <div className="space-y-2">
        <Label htmlFor="download-passphrase">Passphrase (at least 12 characters)</Label>
        <Input
          id="download-passphrase"
          type="password"
          autoComplete="new-password"
          maxLength={MAX_LENGTH}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="download-passphrase-again">Type the passphrase again</Label>
        <Input
          id="download-passphrase-again"
          type="password"
          autoComplete="new-password"
          maxLength={MAX_LENGTH}
          value={again}
          onChange={(event) => setAgain(event.target.value)}
        />
        {mismatch ? <p className="text-sm text-danger">The passphrases do not match.</p> : null}
      </div>
      <StepUpCodeField step={step} />
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </ConfirmationDialog>
  )
}
