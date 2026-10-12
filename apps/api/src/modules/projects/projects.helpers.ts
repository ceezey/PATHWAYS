import { BadRequestException } from '@nestjs/common'
import type { CreateProjectRequest, UpdateProjectRequest } from '@pathways/shared'

export function projectData(input: CreateProjectRequest | UpdateProjectRequest, code: string) {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new BadRequestException('End date must not precede start date.')
  }

  return {
    code,
    title: input.title,
    description: input.description?.trim() || null,
    objectives: input.objectives?.trim() || null,
    implementationArea: input.implementationArea?.trim() || null,
    // projects.implementing_partners is deprecated read-only legacy text (migration 0039).
    ...(input.sector === undefined ? {} : { sector: input.sector?.trim() || null }),
    ...(input.targetBeneficiaries === undefined
      ? {}
      : { targetBeneficiaries: input.targetBeneficiaries }),
    startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
    endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    status: input.status,
    programId: input.programId?.toLowerCase() || null,
  }
}
