import { BeneficiaryForm } from '@/features/beneficiaries/beneficiary-form'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function NewBeneficiaryPage() {
  const projects = await pathwaysClient.getProjects()

  return <BeneficiaryForm projects={projects} />
}
