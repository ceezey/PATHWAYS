import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import { FormDefinitionExportService } from './form-definition-export.service'

const state = vi.hoisted(() => ({ actor: undefined as unknown as ApplicationIdentity }))

vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(tx, state.actor),
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '30000000-0000-4000-8000-000000000003'
const formId = '40000000-0000-4000-8000-000000000004'
const updatedAt = new Date('2026-09-28T00:00:00.000Z')

const form = {
  id: formId,
  projectId,
  code: 'attendance_register',
  version: 3,
  name: 'Attendance register',
  description: null,
  formType: 'OTHER',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  updatedAt,
  formField_form: [
    {
      code: 'score',
      label: 'Secret score label',
      dataType: 'DECIMAL',
      isRequired: false,
      isMetadataKey: false,
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
}

const tx = {
  project: { findFirst: vi.fn() },
  digitalForm: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}

describe('PRD-F5 gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = {
      id: '90000000-0000-4000-8000-000000000009',
      aal: 'aal2',
      userId: '20000000-0000-4000-8000-000000000002',
      organizationId,
      fullName: 'Synthetic M&E actor',
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: ['forms.read', 'forms.export'],
      assignedProjectIds: [projectId],
    }
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.digitalForm.findFirst.mockResolvedValue(form)
    tx.auditLog.create.mockResolvedValue({ id: 'audit' })
  })

  it.each(['CSV', 'XLS', 'XLSX', 'PDF'] as const)(
    'G-F5-4 a %s export writes exactly one audit row with form id, version and format only',
    async (format) => {
      await new FormDefinitionExportService({} as PrismaService).export(
        state.actor,
        projectId,
        formId,
        format,
      )

      expect(tx.auditLog.create).toHaveBeenCalledOnce()
      const audit = tx.auditLog.create.mock.calls[0][0]
      expect(audit.data).toMatchObject({
        action: 'FORM_DEFINITION_EXPORTED',
        entityId: formId,
        changes: { formId, version: 3, format },
      })
      expect(JSON.stringify(audit)).not.toContain('Secret score label')
    },
    20_000,
  )
})
