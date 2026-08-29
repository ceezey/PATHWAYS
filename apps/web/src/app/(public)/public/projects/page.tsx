import { PublicProjectsList } from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/pathways-client'

export default async function PublicProjectsPage() {
  const projects = await pathwaysClient.getPublicProjects()

  return <PublicProjectsList projects={projects} />
}
