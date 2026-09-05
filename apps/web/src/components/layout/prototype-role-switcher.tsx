'use client'

import { ShieldCheck } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { getPrototypeRoleDisplayName, prototypeRoles } from '@/types/prototype-role'

export const PrototypeRoleSwitcher = ({ compact = false }: { compact?: boolean }) => {
  const { enabled, role, setRole } = usePrototypeRole()

  if (!enabled) {
    return null
  }

  return (
    <div className="rounded-sm bg-white/[0.06] p-3 text-white">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-muted" aria-hidden="true" />
        {!compact ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-white">
              View workspace as
            </p>
            <p className="text-[13px] leading-[18px] text-navy-muted">
              Choose a role for this frontend preview.
            </p>
          </div>
        ) : (
          <span className="sr-only">View workspace as</span>
        )}
      </div>
      {!compact ? (
        <div className="mt-3">
          {/* TODO(RBAC): Replace prototype role preview with authenticated server-provided role and permissions. */}
          <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
            <SelectTrigger
              aria-label="Prototype Role Preview"
              className="border-white/25 bg-navy text-white focus:ring-white focus:ring-offset-navy [&>span]:truncate"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {prototypeRoles.map((prototypeRole) => (
                <SelectItem key={prototypeRole} value={prototypeRole}>
                  {getPrototypeRoleDisplayName(prototypeRole)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}
