'use client'

import { ArrowLeft, ShieldAlert } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'

export const BeneficiaryAccessGate = () => (
  <div className="flex min-h-[70vh] items-center justify-center p-6">
    <div className="w-full max-w-2xl space-y-5 rounded-lg border border-border bg-card p-8 text-center">
      <EmptyState
        description="This route requires server-enforced step-up authentication. That integration is not configured, so beneficiary records remain hidden."
        icon={ShieldAlert}
        title="Beneficiary access unavailable"
      />
      <p className="text-sm leading-6 text-muted-foreground">
        Configure the approved assurance flow and validate it on protected server requests before
        enabling this workspace.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  </div>
)
