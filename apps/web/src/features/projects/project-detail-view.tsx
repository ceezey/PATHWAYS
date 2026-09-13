'use client'

import { ArrowLeft, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectDetail } from '@/types/pathways'
import { projectStatusTone } from './project-utils'

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    let active = true
    pathwaysClient
      .getProject(projectId)
      .then((record) => {
        if (!active) return
        setProject(record)
        setStatus('success')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (status === 'loading') {
    return (
      <EmptyState
        description="Checking your project scope."
        icon={FolderKanban}
        title="Loading project"
      />
    )
  }
  if (status === 'error' || !project) {
    return (
      <EmptyState
        description="This project profile is unavailable to the current workspace."
        icon={FolderKanban}
        title="Project unavailable"
      />
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Project profile"
        title={project.title}
        description={project.description || 'No description recorded.'}
        actions={
          <Button asChild variant="outline">
            <Link href="/projects">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to projects
            </Link>
          </Button>
        }
      />
      <section className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Profile"
          description="Persisted project identity and lifecycle fields."
          actions={
            <StatusBadge tone={projectStatusTone(project.status)}>{project.status}</StatusBadge>
          }
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Item label="Code" value={project.code || 'Not recorded'} />
            <Item label="Implementation area" value={project.area} />
            <Item label="Period" value={project.period} />
            <Item label="Project Manager" value={project.projectManager} />
          </dl>
        </SectionCard>
        <SectionCard title="Objectives" description="Current persisted project objectives.">
          <p className="text-sm leading-6 text-muted-foreground">
            {project.objectives || 'No objectives recorded.'}
          </p>
        </SectionCard>
      </section>
      <SectionCard
        title="Additional modules"
        description="Activity, Beneficiary, indicator, finance, and dashboard values appear only after their persisted phase is implemented."
      >
        <p className="text-sm text-muted-foreground">
          No unimplemented metrics are inferred from this project profile.
        </p>
      </SectionCard>
    </>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  )
}
