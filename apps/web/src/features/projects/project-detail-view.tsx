'use client'

import { ArrowLeft, FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectDetail } from '@/types/pathways'
import { projectStatusTone } from './project-utils'

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [editingPeriod, setEditingPeriod] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [savingPeriod, setSavingPeriod] = useState(false)

  useEffect(() => {
    let active = true
    pathwaysClient
      .getProject(projectId)
      .then((record) => {
        if (!active) return
        setProject(record)
        setEndDate(record.endDate ?? '')
        setStatus('success')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [projectId])

  const savePeriod = async () => {
    if (!project || !endDate || (project.startDate && endDate < project.startDate)) {
      toast.error('Choose an end date on or after the project start date.')
      return
    }
    setSavingPeriod(true)
    try {
      const updated = await pathwaysClient.updateProjectPeriod(project.id, endDate)
      setProject(updated)
      setEndDate(updated.endDate ?? '')
      setEditingPeriod(false)
      toast.success('Project period saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Project period could not be saved.')
    } finally {
      setSavingPeriod(false)
    }
  }

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
          {profile?.permissions.includes('projects.create') ? (
            <div className="mt-5 border-t pt-4">
              {editingPeriod ? (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="project-end-date">End date</Label>
                    <Input
                      id="project-end-date"
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                    />
                  </div>
                  <Button disabled={savingPeriod} onClick={() => void savePeriod()}>
                    {savingPeriod ? 'Saving...' : 'Save end date'}
                  </Button>
                  <Button
                    disabled={savingPeriod}
                    variant="outline"
                    onClick={() => {
                      setEndDate(project.endDate ?? '')
                      setEditingPeriod(false)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setEditingPeriod(true)}>
                  Edit end date
                </Button>
              )}
            </div>
          ) : null}
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
