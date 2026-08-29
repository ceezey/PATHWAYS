'use client'

import { ShieldAlert } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'

export const UnauthorizedState = ({ moduleName }: { moduleName: string }) => (
  <div className="flex min-h-[70vh] items-center justify-center p-6">
    <div className="w-full max-w-2xl space-y-4 rounded-lg border border-border bg-card p-8 text-center">
      <EmptyState
        description={`Your authenticated role cannot access ${moduleName}. No protected workspace content is shown.`}
        icon={ShieldAlert}
        title="Unauthorized access"
      />
      <div>
        <Button asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  </div>
)
