import 'reflect-metadata'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '@app/prisma/prisma.service'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { rolePermissions } from '../auth/authorization-policy'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { formTemplates } from './form-templates'
import { MetadataController } from './metadata.controller'
import { GenerateFormDto } from './metadata.dto'
import { MetadataService } from './metadata.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const userId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const foreignProjectId = '30000000-0000-4000-8000-000000000009'
const sourceFormId = '40000000-0000-4000-8000-000000000004'
const createdFormId = '40000000-0000-4000-8000-000000000005'
const now = new Date('2026-09-28T00:00:00.000Z')

const identity: ApplicationIdentity = {
  id: '80000000-0000-4000-8000-000000000008',
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['forms.read', 'forms.generate'],
  assignedProjectIds: [projectId],
}

const sourceField = {
  id: '50000000-0000-4000-8000-000000000005',
  code: 'score',
  label: 'Score',
  dataType: 'INTEGER' as const,
  isRequired: true,
  isMetadataKey: false,
  isSadddField: false,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  sequenceNo: 1,
}

const formRow = (patch: Record<string, unknown> = {}) => ({
  id: sourceFormId,
  projectId,
  code: 'baseline',
  version: 2,
  name: 'Baseline',
  description: 'Synthetic source',
  formType: 'OTHER' as const,
  status: 'PUBLISHED' as const,
  activityId: null,
  journeyStageId: null,
  createdById: userId,
  publishedAt: now,
  archivedAt: null,
  updatedAt: now,
  formField_form: [sourceField],
  ...patch,
})

describe('forms.generate', () => {
  const tx = {
    project: { findFirst: vi.fn() },
    projectActivity: { findFirst: vi.fn() },
    journeyStage: { findFirst: vi.fn() },
    digitalForm: { findFirst: vi.fn(), create: vi.fn() },
    formField: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const service = new MetadataService({} as PrismaService, {} as never)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = identity
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.digitalForm.create.mockResolvedValue({ id: createdFormId })
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
  })

  it('gates the endpoint with forms.generate', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, MetadataController.prototype.generate)).toBe(
      'forms.generate',
    )
  })

  it('is not granted to aggregate-only roles', () => {
    expect(rolePermissions.GRANT_MANAGER).not.toContain('forms.generate')
    expect(rolePermissions.PROGRAM_MANAGER).not.toContain('forms.generate')
  })

  it('creates a draft and fields from a server template, audited', async () => {
    tx.digitalForm.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(formRow({ id: createdFormId, code: 'feedback', status: 'DRAFT' }))
    await service.generateForm(identity, projectId, {
      templateKey: 'training_survey',
      code: 'feedback',
      name: 'Feedback',
    })
    expect(withAuthorizedOperation).toHaveBeenCalledWith(
      expect.anything(),
      identity,
      'forms.generate',
      expect.any(Function),
    )
    expect(tx.digitalForm.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId,
          projectId,
          code: 'feedback',
          version: 1,
          formType: 'TRAINING_SURVEY',
          createdById: userId,
        }),
      }),
    )
    const rows = tx.formField.createMany.mock.calls[0]?.[0].data
    expect(rows).toHaveLength(formTemplates.training_survey.fields.length)
    expect(rows[0]).toMatchObject({ organizationId, projectId, formId: createdFormId })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'FORM_GENERATED',
        changes: expect.objectContaining({ templateKey: 'training_survey', version: 1 }),
      }),
    })
  })

  it('copies fields from an existing form in the same scoped project', async () => {
    tx.digitalForm.findFirst
      .mockResolvedValueOnce(formRow())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(formRow({ id: createdFormId, code: 'baseline_copy', version: 1 }))
    await service.generateForm(identity, projectId, {
      sourceFormId,
      code: 'baseline_copy',
      name: 'Baseline copy',
    })
    expect(tx.digitalForm.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: sourceFormId,
      organizationId,
      projectId,
    })
    expect(tx.formField.createMany.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({ code: 'score', dataType: 'INTEGER', isRequired: true }),
    ])
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: expect.objectContaining({ sourceFormId, sourceVersion: 2 }),
      }),
    })
  })

  it('rejects a duplicate form code without writing', async () => {
    tx.digitalForm.findFirst.mockResolvedValueOnce({ id: sourceFormId })
    await expect(
      service.generateForm(identity, projectId, {
        templateKey: 'general_monitoring',
        code: 'baseline',
        name: 'Baseline',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.digitalForm.create).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: 'x_form', name: 'Form' }],
    [{ templateKey: 'training_survey', sourceFormId, code: 'x_form', name: 'Form' }],
    [{ templateKey: 'no_such_template', code: 'x_form', name: 'Form' }],
    [{ templateKey: '__proto__', code: 'x_form', name: 'Form' }],
    [{ templateKey: 'toString', code: 'x_form', name: 'Form' }],
  ])('rejects an invalid template or source selection before any query', async (input) => {
    await expect(service.generateForm(identity, projectId, input)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(withAuthorizedOperation).not.toHaveBeenCalled()
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('rejects a project outside the actor organization before reading forms', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.generateForm(identity, foreignProjectId, {
        sourceFormId,
        code: 'stolen',
        name: 'Stolen',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }),
    )
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
    expect(tx.digitalForm.create).not.toHaveBeenCalled()
  })

  it('rejects a source form from another organization or project', async () => {
    tx.digitalForm.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.generateForm(identity, projectId, {
        sourceFormId,
        code: 'stolen',
        name: 'Stolen',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.digitalForm.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('validates the request payload shape', () => {
    const errors = (value: unknown) =>
      validateSync(plainToInstance(GenerateFormDto, value)).map((error) => error.property)
    expect(errors({ templateKey: 'training_survey', code: 'ok_code', name: 'Okay' })).toEqual([])
    expect(errors({ sourceFormId: 'not-a-uuid', code: 'ok_code', name: 'Okay' })).toContain(
      'sourceFormId',
    )
    expect(errors({ templateKey: 'training_survey', code: '1bad', name: 'Okay' })).toContain('code')
    expect(errors({ templateKey: 7, code: 'ok_code', name: 'x' })).toEqual(
      expect.arrayContaining(['templateKey', 'name']),
    )
  })
})
