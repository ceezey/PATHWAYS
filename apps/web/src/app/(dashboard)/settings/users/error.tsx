'use client'

import { RefreshCw, UsersRound } from 'lucide-react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/pathways'
import { Button } from '@/components/ui/button'

export default function UserManagementError({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        description="The user directory could not be loaded."
      />
      <EmptyState
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="gap-2" onClick={reset} type="button">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          </div>
        }
        description="Try loading the user directory again."
        icon={UsersRound}
        title="User management unavailable"
      />
    </>
  )
}
