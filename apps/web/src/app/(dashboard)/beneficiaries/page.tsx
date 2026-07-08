import { BeneficiaryDirectory } from '@/features/beneficiaries/beneficiary-directory'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function BeneficiariesPage() {
  const [beneficiaries, projects] = await Promise.all([
    pathwaysClient.getBeneficiaryRecords(),
    pathwaysClient.getProjects(),
  ])
  const [activityGroups, stageGroups] = await Promise.all([
    Promise.all(projects.map((project) => pathwaysClient.getActivities(project.id))),
    Promise.all(projects.map((project) => pathwaysClient.getJourneyStages(project.id))),
  ])

  return (
    <BeneficiaryDirectory
      activities={activityGroups.flat()}
      beneficiaries={beneficiaries}
      projects={projects}
      stages={stageGroups.flat()}
    />
  )
}
