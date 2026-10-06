'use client'

import { ArrowLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'

import { ProjectArchiveDialog } from './project-archive-dialog'
import { ProjectWorkspaceHeader } from './project-workspace-header'
import { useProjectRead } from './use-project-reads'

/**
 * Draws the project heading and tab strip once for every tab, so switching tabs swaps
 * only the content below. Each tab page keeps its own route and its own access check.
 */
export const ProjectWorkspaceFrame = ({
  children,
  projectId,
}: { children: ReactNode; projectId: string }) => {
  const { labels } = useDisplayLabels()
  const { role, profile } = useCurrentRole()
  // Shares the stable project key with every tab, so the read happens once per project.
  const project = useProjectRead(projectId).data ?? null

  // Each tab renders its own loading and unavailable states; the frame waits for the project.
  if (!project) return <>{children}</>

  return (
    <>
      <PageHeader
        eyebrow={labels.projectWorkspace}
        title={project.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="gap-2" variant="outline">
              <Link href="/projects">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Projects
              </Link>
            </Button>
            {role && isUiActionAvailable(role, 'projects.profile.manage', profile) ? (
              <Button asChild size="icon" variant="outline">
                <Link aria-label="Edit project profile" href={`/projects/${project.id}/edit`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            {role && isUiActionAvailable(role, 'projects.archive', profile) ? (
              <ProjectArchiveDialog projectId={project.id} title={project.title} />
            ) : null}
          </div>
        }
      />
      <ProjectWorkspaceHeader project={project} />
      {children}
    </>
  )
}
