'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { BeneficiaryRecord } from '@/types/pathways'
import type { BeneficiaryDraft } from '../registration.utils'

export const ConfirmRegistrationDialog = ({
  confirmOpen,
  setConfirmOpen,
  beneficiary,
  draft,
  supportsCode,
  saving,
  pendingCreate,
  confirmSave,
}: {
  confirmOpen: boolean
  setConfirmOpen: (open: boolean) => void
  beneficiary?: BeneficiaryRecord
  draft: BeneficiaryDraft
  supportsCode: (code: string) => boolean
  saving: boolean
  pendingCreate: { confirming: boolean }
  confirmSave: () => Promise<void>
}) => (
  <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {beneficiary ? 'Confirm profile changes' : 'Confirm beneficiary profile'}
        </DialogTitle>
        <DialogDescription>
          {beneficiary
            ? 'Review these profile changes.'
            : 'Review this coded profile and project enrollment.'}
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-xl border border-border bg-surface-subtle p-4 text-sm">
        <p className="font-medium">{draft.code}</p>
        <p className="mt-1 text-muted-foreground">
          {[
            supportsCode('first_name') ? draft.firstName : '',
            supportsCode('middle_name') ? draft.middleName : '',
            supportsCode('last_name') ? draft.lastName : '',
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      </div>
      <DialogFooter>
        <Button
          disabled={saving}
          type="button"
          variant="outline"
          onClick={() => setConfirmOpen(false)}
        >
          Cancel
        </Button>
        <Button
          disabled={saving || pendingCreate.confirming}
          onClick={() => void confirmSave()}
          type="button"
        >
          {saving || pendingCreate.confirming
            ? 'Saving...'
            : beneficiary
              ? 'Save changes'
              : 'Save beneficiary'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
