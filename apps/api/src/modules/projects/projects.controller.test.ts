import { ForbiddenException, ValidationPipe } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { hasAtomicPermission } from '../auth/authorization-policy'
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

describe('ProjectsController active project contract', () => {
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
    })
    const update = Object.assign(new UpdateProjectDto(), {
      title: 'Synthetic project',
      status: 'ONGOING' as const,

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

  it.each(['62.5', '0', '', null, 75])(
    'rejects retired targetGoal %s through the configured ValidationPipe',
    async (targetGoal) => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        forbidUnknownValues: false,
      })
      for (const metatype of [CreateProjectDto, UpdateProjectDto]) {
        await expect(
          pipe.transform(
            {
              title: 'Synthetic project',
              status: 'PLANNED',
              ...(metatype === UpdateProjectDto
                ? { expectedUpdatedAt: '2026-09-24T00:00:00.000Z' }
                : {}),
              targetGoal,
            },
            { type: 'body', metatype },
          ),
        ).rejects.toMatchObject({
          status: 400,
          response: { message: expect.arrayContaining(['property targetGoal should not exist']) },
        })
      }
    },
  )

  it.each(['Partner A, Partner B', '', null])(
    'rejects deprecated free-text implementingPartners %j through the configured ValidationPipe',
    async (implementingPartners) => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        forbidUnknownValues: false,
      })
      for (const metatype of [CreateProjectDto, UpdateProjectDto]) {
        await expect(
          pipe.transform(
            {
              title: 'Synthetic project',
              status: 'PLANNED',
              ...(metatype === UpdateProjectDto
                ? {
                    expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
                    clientMutationId: '10000000-0000-4000-8000-000000000001',
                  }
                : {}),
              implementingPartnerNames: ['Partner A'],
              implementingPartners,
            },
            { type: 'body', metatype },
          ),
        ).rejects.toMatchObject({
          status: 400,
          response: {
            message: expect.arrayContaining(['property implementingPartners should not exist']),
          },
        })
      }
    },
  )

  it('accepts goal-free creation and optimistic updates through the configured ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    })
    const create = await pipe.transform(
      { title: 'Synthetic project', status: 'PLANNED', targetBeneficiaries: 250 },
      { type: 'body', metatype: CreateProjectDto },
    )
    const update = await pipe.transform(
      {
        title: 'Synthetic project',
        status: 'ONGOING',
        expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
        clientMutationId: '10000000-0000-4000-8000-000000000001',
      },
      { type: 'body', metatype: UpdateProjectDto },
    )
    expect(create.targetBeneficiaries).toBe(250)
    expect(create).not.toHaveProperty('targetGoal')
    expect(update).not.toHaveProperty('targetGoal')
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
      implementingPartnerNames: ['Partner'],
      sector: 'Livelihood',
      targetBeneficiaries: '250',
      projectBudget: '125000.50',

      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'PLANNED',
    })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.targetBeneficiaries).toBe(250)
  })

  it('guards archive with projects.archive, which a Project Officer does not hold', async () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, ProjectsController.prototype.archive)).toBe(
      'projects.archive',
    )
    expect(hasAtomicPermission('PROJECT_OFFICER', ['projects.archive'], 'projects.archive')).toBe(
      false,
    )
    expect(hasAtomicPermission('PROJECT_MANAGER', ['projects.archive'], 'projects.archive')).toBe(
      true,
    )
    const service = { archive: vi.fn().mockResolvedValue({ id: assignedProjectId }) }
    const controller = new ProjectsController(service as unknown as ProjectsService)
    await controller.archive({ user: identity } as AuthenticatedRequest, assignedProjectId)
    expect(service.archive).toHaveBeenCalledWith(identity, assignedProjectId)
  })
})
