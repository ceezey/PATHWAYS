'use client'

import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { rulesHumanClient } from '@/lib/api/rules'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import type { HumanNotification } from '@pathways/shared'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { codeLabel, manilaTime } from '../rules.utils'

export function NotificationRow({ item, onRead }: { item: HumanNotification; onRead: () => void }) {
  const { profile, access } = useCurrentRole()
  const owner = useSensitiveDraftOwner(
    profile,
    'notification-read',
    'alerts.read',
    item.projectId,
    item.id,
    access === 'ready',
  )
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const markRead = async () => {
    if (!owner?.isCurrent() || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice('')
    try {
      await rulesHumanClient.markNotificationRead(item.id)
      if (owner.isCurrent()) onRead()
    } catch {
      if (owner.isCurrent()) setNotice('Could not mark this notification read. Try again.')
    } finally {
      inFlight.current = false
      if (owner.isCurrent()) setBusy(false)
    }
  }
  return (
    <li className="space-y-2 rounded-sm border border-border p-3">
      <p>{item.message}</p>
      <p className="text-sm text-muted-foreground">
        {manilaTime(item.createdAt)}; {codeLabel(item.deliveryState)}
      </p>
      <Link className="text-primary underline" href={`/alerts?alert=${item.alertId}`}>
        View alert
      </Link>
      {item.readAt ? (
        <p className="text-sm">Read</p>
      ) : (
        <Button
          disabled={busy || !owner}
          type="button"
          variant="outline"
          onClick={() => void markRead()}
        >
          Mark read
        </Button>
      )}
      {notice ? <output className="block text-sm">{notice}</output> : null}
    </li>
  )
}
