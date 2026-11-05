'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import {
  STEP_UP_COMPLETED_EVENT,
  announceStepUpRequired,
} from '@/lib/auth/beneficiary-step-up-events'

// Beneficiary photos and videos stay hidden until a fresh step-up; the shared prompt verifies and the list reloads.
export const PublicMediaStepUpNote = ({ onVerified }: { onVerified: () => void }) => {
  useEffect(() => {
    window.addEventListener(STEP_UP_COMPLETED_EVENT, onVerified)
    return () => window.removeEventListener(STEP_UP_COMPLETED_EVENT, onVerified)
  }, [onVerified])
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        Beneficiary photos and videos are hidden until you verify again.
      </p>
      <Button onClick={announceStepUpRequired} size="sm" type="button" variant="outline">
        Verify again
      </Button>
    </div>
  )
}
