import { Eye, KeyRound, MoreHorizontal, Pencil, RotateCcw, UserX } from 'lucide-react'

import { StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserRecord } from '@/types/pathways'
import { getUserInitials, userAccountStatusTone } from '../settings.utils'

export const UserAccountRow = ({
  onDeactivate,
  onEdit,
  onReactivate,
  onView,
  unavailableReason,
  user,
}: {
  onDeactivate: () => void
  onEdit: () => void
  onReactivate: () => void
  onView: () => void
  unavailableReason?: string
  user: UserRecord
}) => (
  <li className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary">
        {getUserInitials(user.name)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words font-semibold text-foreground">{user.name}</p>
          <StatusBadge tone={userAccountStatusTone(user.accountStatus)}>
            {user.accountStatus}
          </StatusBadge>
        </div>
        <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {user.role} · {user.projectAccess.join(', ')}
        </p>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
      <Button onClick={onView} size="sm" type="button" variant="outline">
        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
        View
      </Button>
      {unavailableReason ? (
        <Button
          aria-label={`Account actions unavailable for ${user.name}`}
          className="gap-2"
          disabled
          size="sm"
          title={unavailableReason}
          type="button"
          variant="outline"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          View only
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Account actions for ${user.name}`}
              size="icon"
              type="button"
              variant="outline"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Account actions</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Edit user
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.accountStatus !== 'Active' ? (
              <DropdownMenuItem onSelect={onReactivate}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Authorize account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-destructive" onSelect={onDeactivate}>
                <UserX className="mr-2 h-4 w-4" aria-hidden="true" />
                Deactivate account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  </li>
)
