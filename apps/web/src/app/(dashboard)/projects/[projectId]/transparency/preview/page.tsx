import { EyeOff } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { PublicProjectDetail } from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'

export default async function StaffPublicProjectPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  try {
    const project = await pathwaysClient.getPublicProject(projectId)

    return <PublicProjectDetail mode="staff-preview" project={project} />
  } catch (error) {
    if (error instanceof PathwaysClientError && error.code === 'not_found') {
      return (
        <>
          <PageHeader
            eyebrow="Public Project Dashboard"
            title="Public preview unavailable"
            description="This project does not yet have an approved public prototype record."
          />
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href={`/projects/${projectId}/transparency`}>
                  Back to public dashboard controls
                </Link>
              </Button>
            }
            className="min-h-80 rounded-lg border border-border bg-card"
            description="Add an approved, non-sensitive public project record before opening the donor-facing staff preview."
            icon={EyeOff}
            title="No approved public preview"
          />
        </>
      )
    }

    throw error
  }
}
