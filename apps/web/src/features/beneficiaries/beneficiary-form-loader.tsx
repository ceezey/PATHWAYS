'use client'

import { FolderLock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectSummary } from '@/types/pathways'

import { BeneficiaryForm } from './beneficiary-form'

export const BeneficiaryFormLoader = () => {
  const { role } = useCurrentRole()
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; projects: ProjectSummary[] } | { status: 'failed' }
  >({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    if (!role) {
      setState({ status: 'failed' })
      return
    }

    void pathwaysClient
      .getProjectsForRole(role)
      .then((nextProjects) => {
        if (active) {
          setState({ status: 'ready', projects: nextProjects })
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'failed' })
        }
      })

    return () => {
      active = false
    }
  }, [role])

  if (state.status === 'loading') {
    return (
      <div
        aria-live="polite"
        className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground"
      >
        Loading assigned project choices...
      </div>
    )
  }

  if (state.status === 'failed') {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <EmptyState
          description="Project choices could not be loaded. The beneficiary backend integration may not be configured."
          icon={FolderLock}
          title="Project choices unavailable"
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    )
  }

  const { projects } = state

  if (projects.length === 0) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <EmptyState
          description="No projects were returned for your authenticated role. The project integration may not be configured, or no projects are assigned."
          icon={FolderLock}
          title="No assigned projects available"
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    )
  }

  return <BeneficiaryForm projects={projects} />
}
