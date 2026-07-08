import { PublicHomeDashboard } from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function HomePage() {
  const projects = await pathwaysClient.getPublicProjects()

  return <PublicHomeDashboard projects={projects} />
}
