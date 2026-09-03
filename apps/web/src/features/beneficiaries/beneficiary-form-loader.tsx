'use client'

import { FolderLock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AsyncState, StatusMessage } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { ProjectSummary } from '@/types/pathways'

import { BeneficiaryForm } from './beneficiary-form'

export const BeneficiaryFormLoader = () => {
  const { role } = usePrototypeRole()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    void loadAttempt
    let active = true
    setProjects(null)
    setLoadState('loading')

    void pathwaysClient
      .getProjectsForRole(role)
      .then((nextProjects) => {
        if (active) {
          setProjects(nextProjects)
          setLoadState('ready')
        }
      })
      .catch(() => {
        if (active) {
          setLoadState('error')
        }
      })

    return () => {
      active = false
    }
  }, [loadAttempt, role])

  if (loadState === 'loading') {
    return (
      <AsyncState
        description="Loading the project choices assigned to this prototype role."
        icon={FolderLock}
        status="loading"
        title="Loading assigned projects"
      />
    )
  }

  if (loadState === 'error' || projects === null) {
    return (
      <AsyncState
        description="The assigned project choices could not be loaded. Check your connection and try again."
        icon={FolderLock}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="Project choices unavailable"
      />
    )
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-8 text-center">
        <AsyncState
          description="No projects are assigned to this prototype role, so a Beneficiary enrollment preview cannot be started."
          icon={FolderLock}
          status="empty"
          title="No assigned projects available"
        />
        <Button asChild>
          <Link href="/beneficiaries">Back to Beneficiaries</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <StatusMessage>Assigned project choices loaded.</StatusMessage>
      <BeneficiaryForm projects={projects} />
    </>
  )
}
