import { Building2, Clock3, KeyRound, ShieldCheck } from 'lucide-react'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { UserRecord } from '@/types/pathways'
import { formatAccountDate, getUserInitials, userAccountStatusTone } from '../settings.utils'

export const UserDetailDialog = ({ onClose, user }: { onClose: () => void; user?: UserRecord }) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(user)}>
    {user ? (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account details</DialogTitle>
          <DialogDescription>
            Review account information without opening an editing workflow.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-sm border border-border bg-surface-subtle p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary">
            {getUserInitials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{user.name}</p>
            <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2">
              <StatusBadge tone={userAccountStatusTone(user.accountStatus)}>
                {user.accountStatus}
              </StatusBadge>
            </div>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailItem icon={ShieldCheck} label="Role" value={user.role} />
          <DetailItem icon={KeyRound} label="Sign-in method" value={user.signInMethod} />
          <DetailItem
            icon={Building2}
            label="Access labels"
            value={user.projectAccess.join(', ')}
          />
          <DetailItem
            icon={Clock3}
            label="Last active"
            value={formatAccountDate(user.lastActiveAt)}
          />
        </dl>
        <DialogFooter>
          <Button onClick={onClose} type="button">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    ) : null}
  </Dialog>
)

const DetailItem = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck
  label: string
  value: string
}) => (
  <div className="rounded-sm border border-border bg-surface-subtle p-3">
    <dt className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-2 text-sm font-medium leading-5 text-foreground">{value}</dd>
  </div>
)
