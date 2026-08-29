import { Globe2 } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { PublicProjectDetail } from '@/features/public/public-project-components'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'

export default async function PublicProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  try {
    const project = await pathwaysClient.getPublicProject(projectId)

    return <PublicProjectDetail project={project} />
  } catch (error) {
    if (error instanceof PathwaysClientError && error.code === 'not_found') {
      notFound()
    }

    if (error instanceof PathwaysClientError && error.code === 'not_configured') {
      return (
        <main className="mx-auto flex min-h-[70vh] w-full max-w-4xl items-center px-6 py-12">
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href="/public/projects">Back to public projects</Link>
              </Button>
            }
            className="w-full rounded-lg border border-slate-200 bg-white"
            description="Published project details will appear after the approved public publishing service is connected."
            icon={Globe2}
            title="Public project details are not available yet"
          />
        </main>
      )
    }

    throw error
  }
}
