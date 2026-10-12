import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import {
  type CreateProjectRequest,
  type UpdateProjectRequest,
  createProjectRequest,
  hasAtomicPermission,
  updateProjectRequest,
} from '@pathways/shared'
import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ProjectsController } from './projects.controller'
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
const createPipe = new ZodPipe(createProjectRequest)
const updatePipe = new ZodPipe(updateProjectRequest)
const updateKeys = {
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
  clientMutationId: '10000000-0000-4000-8000-000000000001',
}

// The 400 messages a pipe answered, or a failure when it accepted the body.
function rejection(run: () => unknown): string[] {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException)
    return ((error as BadRequestException).getResponse() as { message: string[] }).message
  }
  throw new Error('Expected a BadRequestException.')
}

describe('ProjectsController active project contract', () => {
  it('passes authenticated create and update payloads to the scoped project service', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ id: 'created' }),
      update: vi.fn().mockResolvedValue({ id: 'updated' }),
    }
    const controller = new ProjectsController(service as unknown as ProjectsService)
    const request = { user: identity } as AuthenticatedRequest
    const create: CreateProjectRequest = { title: 'Synthetic project', status: 'PLANNED' }
    const update: UpdateProjectRequest = {
      title: 'Synthetic project',
      status: 'ONGOING',
      ...updateKeys,
    }

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
    'rejects retired targetGoal %s through the project contracts',
    (targetGoal) => {
      const body = { title: 'Synthetic project', status: 'PLANNED', targetGoal }
      for (const [pipe, extra] of [
        [createPipe, {}],
        [updatePipe, updateKeys],
      ] as const) {
        expect(rejection(() => pipe.transform({ ...body, ...extra }))).toContain(
          "Unrecognized key(s) in object: 'targetGoal'",
        )
      }
    },
  )

  it.each(['Partner A, Partner B', '', null])(
    'rejects deprecated free-text implementingPartners %j through the project contracts',
    (implementingPartners) => {
      const body = {
        title: 'Synthetic project',
        status: 'PLANNED',
        implementingPartnerNames: ['Partner A'],
        implementingPartners,
      }
      for (const [pipe, extra] of [
        [createPipe, {}],
        [updatePipe, updateKeys],
      ] as const) {
        expect(rejection(() => pipe.transform({ ...body, ...extra }))).toContain(
          "Unrecognized key(s) in object: 'implementingPartners'",
        )
      }
    },
  )

  it('accepts goal-free creation and optimistic updates through the project contracts', () => {
    const create = createPipe.transform({
      title: 'Synthetic project',
      status: 'PLANNED',
      targetBeneficiaries: 250,
    })
    const update = updatePipe.transform({
      title: 'Synthetic project',
      status: 'ONGOING',
      ...updateKeys,
    })
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
  ])('rejects invalid Project count or PHP budget input %j', (invalid) => {
    expect(
      createProjectRequest.safeParse({ title: 'Synthetic project', status: 'PLANNED', ...invalid })
        .success,
    ).toBe(false)
  })

  it('keeps the PHP budget message the web shows', () => {
    expect(
      rejection(() =>
        createPipe.transform({
          title: 'Synthetic project',
          status: 'PLANNED',
          projectBudget: '-1',
        }),
      ),
    ).toEqual(['projectBudget must be a non-negative PHP amount with at most 2 decimal places.'])
  })

  it('accepts the complete repaired Project transport contract', () => {
    const parsed = createProjectRequest.parse({
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
    expect(parsed.targetBeneficiaries).toBe(250)
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
