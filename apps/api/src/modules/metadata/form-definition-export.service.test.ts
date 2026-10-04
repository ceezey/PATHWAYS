import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseWorkbook } from '@pathways/imports'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission, rolePermissions } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import { FORM_DEFINITION_EXPORT_COLUMNS } from './form-definition-export'
import { FormDefinitionExportService } from './form-definition-export.service'
import { MetadataController } from './metadata.controller'

const state = vi.hoisted(() => ({
  actor: undefined as unknown as ApplicationIdentity,
  permissions: [] as string[],
}))

vi.mock('../auth/authorized-operation', async () => {
  const { ForbiddenException: Forbidden } = await import('@nestjs/common')
  return {
    withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission, work) => {
      state.permissions.push(permission)
      if (!state.actor.permissions.includes(permission)) {
        throw new Forbidden('Required application permission is missing.')
      }
      return work(tx, state.actor)
    }),
  }
})

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '30000000-0000-4000-8000-0000000000ff'
const formId = '40000000-0000-4000-8000-000000000004'
const updatedAt = new Date('2026-09-28T00:00:00.000Z')

const actor = (patch: Partial<ApplicationIdentity> = {}): ApplicationIdentity => ({
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: '20000000-0000-4000-8000-000000000002',
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['forms.read', 'forms.export'],
  assignedProjectIds: [projectId],
  ...patch,
})

const form = (patch: Record<string, unknown> = {}) => ({
  id: formId,
  projectId,
  code: 'attendance_register',
  version: 3,
  name: 'Attendance register',
  description: '=HYPERLINK("https://example.invalid")',
  formType: 'OTHER',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  updatedAt,
  formField_form: [
    {
      code: 'status',
      label: 'Status',
      dataType: 'SINGLE_SELECT',
      isRequired: true,
      isMetadataKey: false,
      isSadddField: false,
      allowedValues: ['present', 'absent'],
      minimumValue: null,
      maximumValue: null,
      minimumDate: null,
      maximumDate: null,
      minimumLength: null,
      maximumLength: null,
      sequenceNo: 2,
    },
    {
      code: 'score',
      label: '+Score',
      dataType: 'DECIMAL',
      isRequired: false,
      isMetadataKey: true,
      isSadddField: false,
      allowedValues: null,
      minimumValue: new Prisma.Decimal(0),
      maximumValue: new Prisma.Decimal(10),
      minimumDate: null,
      maximumDate: null,
      minimumLength: null,
      maximumLength: null,
      sequenceNo: 1,
    },
  ],
  ...patch,
})

const tx = {
  project: { findFirst: vi.fn() },
  digitalForm: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}

describe('form-definition export', () => {
  let service: FormDefinitionExportService

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor()
    state.permissions = []
    service = new FormDefinitionExportService({} as PrismaService)
    tx.project.findFirst.mockImplementation(
      async (args: { where: { AND: [{ id?: { in: string[] } }, { id: string }] } }) => {
        const [scope, wanted] = args.where.AND
        return scope.id && !scope.id.in.includes(wanted.id) ? null : { id: wanted.id }
      },
    )
    tx.digitalForm.findFirst.mockResolvedValue(form())
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
  })

  it('exports CSV with the 24 blank-definition columns and neutralized formula cells', async () => {
    const result = await service.export(state.actor, projectId, formId, 'CSV')
    const text = result.bytes.toString('utf8')
    const [header, first, second] = text.replace(/^﻿/, '').trim().split('\r\n')

    expect(header).toBe(FORM_DEFINITION_EXPORT_COLUMNS.map((name) => `"${name}"`).join(','))
    expect(first).toContain('"score"')
    expect(first).toContain(`"'+Score"`)
    expect(first).toContain(`"'=HYPERLINK(""https://example.invalid"")"`)
    expect(second).toContain('"[""present"",""absent""]"')
    expect(result).toMatchObject({
      contentType: 'text/csv',
      fileName: 'attendance-register-v3.csv',
    })
  })

  it.each([
    ['XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['XLS', 'application/vnd.ms-excel'],
  ] as const)('exports %s through the shared workbook writer', async (format, mime) => {
    const result = await service.export(state.actor, projectId, formId, format)
    const workbook = parseWorkbook(
      result.bytes.buffer.slice(
        result.bytes.byteOffset,
        result.bytes.byteOffset + result.bytes.byteLength,
      ) as ArrayBuffer,
    )

    expect(workbook.headers).toEqual([...FORM_DEFINITION_EXPORT_COLUMNS])
    expect(workbook.rows).toHaveLength(2)
    expect(workbook.rows[0].field_label).toBe("'+Score")
    expect(result.contentType).toBe(mime)
    expect(result.fileName).toBe(`attendance-register-v3.${format.toLowerCase()}`)
  })

  it('exports PDF with the bundled renderer', async () => {
    const result = await service.export(state.actor, projectId, formId, 'PDF')
    expect(result.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(result.contentType).toBe('application/pdf')
  }, 20_000)

  it('writes one audit row with the form ID, version and format and no field content', async () => {
    await service.export(state.actor, projectId, formId, 'XLSX')

    expect(tx.auditLog.create).toHaveBeenCalledOnce()
    const audit = tx.auditLog.create.mock.calls[0][0]
    expect(audit).toEqual({
      data: {
        organizationId,
        actorUserId: state.actor.userId,
        projectId,
        action: 'FORM_DEFINITION_EXPORTED',
        entityType: 'DigitalForm',
        entityId: formId,
        changes: { formId, version: 3, format: 'XLSX' },
      },
    })
    expect(JSON.stringify(audit)).not.toContain('Score')
    expect(state.permissions).toEqual(['forms.export', 'forms.export'])
  })

  it.each([undefined, 'csv', 'DOCX', ['CSV']])(
    'rejects format %j before any query',
    async (format) => {
      await expect(service.export(state.actor, projectId, formId, format)).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(tx.project.findFirst).not.toHaveBeenCalled()
    },
  )

  it('denies an actor without forms.export before any query', async () => {
    state.actor = actor({ roles: ['PROJECT_OFFICER'], permissions: ['forms.read'] })
    await expect(service.export(state.actor, projectId, formId, 'CSV')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('denies a cross-project export before the form query', async () => {
    await expect(service.export(state.actor, otherProjectId, formId, 'CSV')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.digitalForm.findFirst).not.toHaveBeenCalled()
  })

  it('scopes the form query to the actor organization and project', async () => {
    tx.digitalForm.findFirst.mockResolvedValue(null)
    state.actor = actor({ organizationId: '10000000-0000-4000-8000-0000000000ff' })

    await expect(service.export(state.actor, projectId, formId, 'CSV')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.digitalForm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: formId,
          organizationId: '10000000-0000-4000-8000-0000000000ff',
          projectId,
        },
      }),
    )
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('fails whole when the definition exceeds the artifact bounds', async () => {
    const huge = form().formField_form[1]
    tx.digitalForm.findFirst.mockResolvedValue(
      form({ formField_form: [{ ...huge, allowedValues: ['x'.repeat(2_100)] }] }),
    )
    await expect(service.export(state.actor, projectId, formId, 'CSV')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    )
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('refuses to audit a download whose form changed during rendering', async () => {
    tx.digitalForm.findFirst
      .mockResolvedValueOnce(form())
      .mockResolvedValueOnce(form({ updatedAt: new Date('2026-09-28T01:00:00.000Z') }))
    await expect(service.export(state.actor, projectId, formId, 'CSV')).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('keeps forms.export within System Administrator and M&E grants', () => {
    const granted = Object.entries(rolePermissions)
      .filter(([role, permissions]) => hasAtomicPermission(role, permissions, 'forms.export'))
      .map(([role]) => role)
    expect(granted.sort()).toEqual(['MONITORING_AND_EVALUATION_OFFICER', 'SYSTEM_ADMINISTRATOR'])
  })

  it('declares forms.export and no-store on the route handler', () => {
    const handler = MetadataController.prototype.exportDefinition
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe('forms.export')
    expect(Reflect.getMetadata('__headers__', handler)).toEqual([
      { name: 'Cache-Control', value: 'private, no-store' },
    ])
  })
})
