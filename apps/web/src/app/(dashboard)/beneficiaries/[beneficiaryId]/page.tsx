import { notFound } from 'next/navigation'

import { BeneficiaryDetail } from '@/features/beneficiaries/beneficiary-detail'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'

export default async function BeneficiaryDetailPage({
  params,
}: {
  params: Promise<{ beneficiaryId: string }>
}) {
  const { beneficiaryId } = await params

  try {
    const [beneficiary, projects] = await Promise.all([
      pathwaysClient.getBeneficiaryRecord(beneficiaryId),
      pathwaysClient.getProjects(),
    ])
    const projectIds = beneficiary.projectIds
    const [activityGroups, stageGroups] = await Promise.all([
      Promise.all(projectIds.map((projectId) => pathwaysClient.getActivities(projectId))),
      Promise.all(projectIds.map((projectId) => pathwaysClient.getJourneyStages(projectId))),
    ])

    return (
      <BeneficiaryDetail
        activities={activityGroups.flat()}
        beneficiary={beneficiary}
        projects={projects}
        stages={stageGroups.flat()}
      />
    )
  } catch (error) {
    if (error instanceof PathwaysClientError && error.code === 'not_found') {
      notFound()
    }

    throw error
  }
}
