import { ForbiddenException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity, AuthenticatedRequest } from '../auth/developer-access'
import { ProjectsController } from './projects.controller'
import { CreateProjectDto, UpdateProjectDto } from './projects.dto'
import type { ProjectsService } from './projects.service'

const assignedProjectId = '51000000-0000-4000-8000-000000000004'
const identity: ApplicationIdentity = {
  id: '51000000-0000-4000-8000-000000000001',
  aal: 'aal2',
  userId: '51000000-0000-4000-8000-000000000002',
  organizationId: '51000000-0000-4000-8000-000000000003',
  fullName: 'Synthetic manager',
  roles: ['PROJECT_MANAGER'],
  permissions: ['projects.read', 'projects.create'],
  assignedProjectIds: [assignedProjectId],
}

describe('ProjectsController target goal contract', () => {
  it('passes authenticated create and update payloads to the scoped project service', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ id: 'created' }),
      update: vi.fn().mockResolvedValue({ id: 'updated' }),
    }
    const controller = new ProjectsController(service as unknown as ProjectsService)
    const request = { user: identity } as AuthenticatedRequest
    const create = Object.assign(new CreateProjectDto(), {
      title: 'Synthetic project',
      status: 'PLANNED' as const,
      targetGoal: '62.5',
    })
    const update = Object.assign(new UpdateProjectDto(), {
      title: 'Synthetic project',
      status: 'ONGOING' as const,
      targetGoal: '75.25',
      expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
    })

    await expect(controller.create(request, create)).resolves.toEqual({ id: 'created' })
    await expect(controller.update(request, assignedProjectId, update)).resolves.toEqual({
      id: 'updated',
    })
    expect(service.create).toHaveBeenCalledWith(identity, create)
    expect(service.update).toHaveBeenCalledWith(identity, assignedProjectId, update)
  })

  it('rejects requests without an authenticated application profile', () => {
    const controller = new ProjectsController({} as ProjectsService)
    expect(() => controller.list({} as AuthenticatedRequest)).toThrow(ForbiddenException)
  })

  it.each(['0', '-1', '100.0001', '50.00001', '1e2', 'NaN', 'Infinity'])(
    'rejects invalid create target goal %s at the transport boundary',
    async (targetGoal) => {
      const dto = plainToInstance(CreateProjectDto, {
        title: 'Synthetic project',
        status: 'PLANNED',
        targetGoal,
      })
      expect(await validate(dto)).not.toHaveLength(0)
    },
  )

  it('accepts exact four-decimal target goals and optional update omission', async () => {
    const create = plainToInstance(CreateProjectDto, {
      title: 'Synthetic project',
      status: 'PLANNED',
      targetGoal: '62.5000',
    })
    const update = plainToInstance(UpdateProjectDto, {
      title: 'Synthetic project',
      status: 'ONGOING',
      expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
    })
    expect(await validate(create)).toHaveLength(0)
    expect(await validate(update)).toHaveLength(0)
  })

  it.each([
    { targetBeneficiaries: -1 },
    { targetBeneficiaries: 2_147_483_648 },
    { targetBeneficiaries: 1.5 },
    { projectBudget: '-1' },
    { projectBudget: '1.001' },
    { projectBudget: '1e3' },
  ])('rejects invalid Project count or PHP budget input %j', async (invalid) => {
    const dto = plainToInstance(CreateProjectDto, {
      title: 'Synthetic project',
      status: 'PLANNED',
      targetGoal: '75',
      ...invalid,
    })
    expect(await validate(dto)).not.toHaveLength(0)
  })

  it('accepts the complete repaired Project transport contract', async () => {
    const dto = plainToInstance(CreateProjectDto, {
      title: 'Synthetic project',
      description: 'Description',
      objectives: 'Objectives',
      implementationArea: 'Area',
      implementingPartners: 'Partner',
      sector: 'Livelihood',
      targetBeneficiaries: '250',
      projectBudget: '125000.50',
      targetGoal: '75.5000',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'PLANNED',
    })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.targetBeneficiaries).toBe(250)
  })
})
