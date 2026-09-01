'use client'

import { FolderLock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { ProjectSummary } from '@/types/pathways'

import { BeneficiaryForm } from './beneficiary-form'

export const BeneficiaryFormLoader = () => {
  const { role } = usePrototypeRole()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)

  useEffect(() => {
    let active = true
    setProjects(null)

    void pathwaysClient
      .getProjectsForRole(role)
      .then((nextProjects) => {
        if (active) {
          setProjects(nextProjects)
        }
      })
      .catch(() => {
        if (active) {
          setProjects([])
        }
      })

    return () => {
      active = false
    }
  }, [role])

  if (projects === null) {
    return (
      <div
        aria-live="polite"
        className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground"
      >
        Loading assigned project choices...
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <EmptyState
          description="No projects are assigned to this prototype role, so a Beneficiary enrollment preview cannot be started."
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
