import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import {
  type FormFieldValidationContract,
  beneficiaryRegistrationDefinitionErrors,
  beneficiaryRegistrationFieldRules,
} from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import { BeneficiariesController } from './beneficiaries.controller'
import { BeneficiariesService } from './beneficiaries.service'

// cr-pathways-default-registration-form: provisioning endpoint, template listing and the fixed
// field set of migration 0040. The real authorized-operation wrapper runs here so the role and
// permission chain is exercised; only the verified transaction and profile read are synthetic.

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '30000000-0000-4000-8000-000000000003'
const templateId = '40000000-0000-4000-8000-000000000004'
const customId = '40000000-0000-4000-8000-000000000005'

const registrar: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: '20000000-0000-4000-8000-000000000002',
  organizationId,
  fullName: 'Synthetic officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['beneficiaries.records.read', 'beneficiaries.records.register'],
  assignedProjectIds: [projectId],
}

const profile = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('../auth/application-profile.service', () => ({
  readApplicationProfile: vi.fn(async () => profile.current),
}))
vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))

const migration = readFileSync(
  path.resolve(
    __dirname,
    '../../../prisma/migrations/0040_default_registration_form/migration.sql',
  ),
  'utf8',
)

/** Parses the fixed VALUES rows of ensure_default_registration_form. */
function templateFields() {
  const rows = [
    ...migration.matchAll(
      /^\s+\((\d+),'([a-z_]+)','([^']+)','([A-Z_]+)',(true|false),(true|false),(true|false),(NULL|'(\[[^']*\])')\),?$/gm,
    ),
  ]
  return rows.map((row) => ({
    sequence: Number(row[1]),
    code: row[2],
    label: row[3],
    dataType: row[4] as FormFieldValidationContract['dataType'],
    required: row[5] === 'true',
    metadataKey: row[6] === 'true',
    sadddField: row[7] === 'true',
    allowedValues: row[9] ? (JSON.parse(row[9]) as string[]) : null,
  }))
}

const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  digitalForm: { groupBy: vi.fn(), findMany: vi.fn() },
}

const definitionRow = (id: string, code: string) => ({
  id,
  code,
  version: 1,
  name: 'Beneficiary registration',
  formType: 'BENEFICIARY_REGISTRATION',
  status: 'PUBLISHED',
  formField_form: templateFields().map((field) => ({
    id: `${field.code}-field`,
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    isRequired: field.required,
    allowedValues: field.allowedValues,
    minimumValue: null,
    maximumValue: null,
    minimumDate: null,
    maximumDate: null,
    minimumLength: null,
    maximumLength: null,
    sequenceNo: field.sequence,
    isMetadataKey: field.metadataKey,
    isSadddField: field.sadddField,
  })),
})

let service: BeneficiariesService
beforeEach(() => {
  vi.clearAllMocks()
  profile.current = registrar
  service = new BeneficiariesService({
    withVerifiedContext: vi.fn(async (_context, work) => work(tx)),
  } as unknown as PrismaService)
  tx.project.findFirst.mockResolvedValue({ id: projectId })
  tx.$queryRaw.mockResolvedValue([{ outcome: 'PROVISIONED' }])
  tx.digitalForm.groupBy.mockImplementation(async ({ where }) =>
    where.systemTemplateKey === null
      ? []
      : [{ code: 'system_default_registration', _max: { version: 1 } }],
  )
  tx.digitalForm.findMany.mockResolvedValue([
    definitionRow(templateId, 'system_default_registration'),
  ])
})

describe('system default registration template (0040)', () => {
  it('provisions exactly the canonical registration field contract', () => {
    const fields = templateFields()
    expect(fields.map((field) => field.code)).toEqual(
      Object.keys(beneficiaryRegistrationFieldRules),
    )
    expect(fields.map((field) => field.sequence)).toEqual(fields.map((_, index) => index + 1))
    expect(beneficiaryRegistrationDefinitionErrors(fields)).toEqual([])
    for (const [code, rule] of Object.entries(beneficiaryRegistrationFieldRules)) {
      const field = fields.find((item) => item.code === code)
      expect(field?.dataType).toBe(rule.dataType)
      expect(field?.required).toBe('required' in rule && rule.required)
      expect(field?.allowedValues).toEqual('allowedValues' in rule ? [...rule.allowedValues] : null)
    }
    expect(fields.filter((field) => field.sadddField).map((field) => field.code)).toEqual([
      'sex',
      'birth_date',
      'age_at_registration',
      'disability_status',
    ])
  })

  it('routes provisioning under registration permission without Beneficiary step-up', () => {
    const handler = BeneficiariesController.prototype.ensureDefaultRegistrationForm
    expect(Reflect.getMetadata(PERMISSION_KEY, handler)).toBe('beneficiaries.records.register')
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('registration-context/default-form')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
    expect(Reflect.getMetadata(BENEFICIARY_STEP_UP_KEY, handler)).toBeUndefined()
  })

  it.each(['PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_MANAGER'])(
    'scopes the project before provisioning and returns only blank definitions for %s',
    async (role) => {
      profile.current = { ...registrar, roles: [role] }
      const result = await service.ensureDefaultRegistrationForm(registrar, projectId)
      expect(tx.project.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
        tx.$queryRaw.mock.invocationCallOrder[0],
      )
      const [query, ...parameters] = tx.$queryRaw.mock.calls[0]
      expect(query.join('?')).toContain('pathways.ensure_default_registration_form(?::uuid)')
      expect(parameters).toEqual([projectId])
      expect(Object.keys(result).sort()).toEqual(['businessDate', 'definitions', 'projectId'])
      expect(result.definitions).toEqual([
        expect.objectContaining({ id: templateId, code: 'system_default_registration' }),
      ])
      expect(JSON.stringify(result)).not.toMatch(/createdById|publishedById|systemTemplateKey/)
    },
  )

  it.each([
    ['PROGRAM_MANAGER', ['beneficiaries.records.register', 'beneficiaries.records.read']],
    ['GRANT_MANAGER', ['beneficiaries.records.register', 'beneficiaries.records.read']],
    ['SYSTEM_ADMINISTRATOR', ['beneficiaries.records.register', 'beneficiaries.records.read']],
    ['PROJECT_OFFICER', ['beneficiaries.records.read']],
  ])('denies %s before any project or definition read', async (role, permissions) => {
    // Even a forged grant list cannot exceed the role ceiling.
    profile.current = { ...registrar, roles: [role], permissions }
    await expect(service.ensureDefaultRegistrationForm(registrar, projectId)).rejects.toMatchObject(
      {
        status: 403,
      },
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('denies an unassigned or foreign-organization project before provisioning', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.ensureDefaultRegistrationForm(registrar, '30000000-0000-4000-8000-000000000099'),
    ).rejects.toMatchObject({ status: 404 })
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({ organizationId }),
            { id: '30000000-0000-4000-8000-000000000099' },
          ],
        },
      }),
    )
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('turns a database scope denial into a safe 403 without detail', async () => {
    tx.$queryRaw.mockRejectedValue(
      Object.assign(new Error('Default registration form unavailable'), { code: 'P2010' }),
    )
    await expect(service.ensureDefaultRegistrationForm(registrar, projectId)).rejects.toMatchObject(
      {
        status: 403,
        message: 'Application scope could not be verified.',
      },
    )
    expect(tx.digitalForm.groupBy).not.toHaveBeenCalled()
  })

  it('rejects malformed project input before the wrapper', () => {
    expect(() => service.ensureDefaultRegistrationForm(registrar, 'not-a-uuid')).toThrow(
      'Project identifier is invalid.',
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('reports a reserved code held by another form as a conflict', async () => {
    tx.$queryRaw.mockResolvedValue([{ outcome: 'CODE_IN_USE' }])
    await expect(service.ensureDefaultRegistrationForm(registrar, projectId)).rejects.toMatchObject(
      {
        status: 409,
      },
    )
    expect(tx.digitalForm.groupBy).not.toHaveBeenCalled()
  })

  it.each([[[]], [[{ outcome: 'SOMETHING' }]], [[{}]]])(
    'fails closed on a malformed provisioning reply %j',
    async (reply) => {
      tx.$queryRaw.mockResolvedValue(reply)
      await expect(
        service.ensureDefaultRegistrationForm(registrar, projectId),
      ).rejects.toMatchObject({ status: 403 })
      expect(tx.digitalForm.groupBy).not.toHaveBeenCalled()
    },
  )

  it('returns an existing template idempotently and an archived one as no definitions', async () => {
    tx.$queryRaw.mockResolvedValue([{ outcome: 'EXISTING' }])
    expect(
      (await service.ensureDefaultRegistrationForm(registrar, projectId)).definitions,
    ).toHaveLength(1)
    tx.digitalForm.groupBy.mockResolvedValue([])
    expect((await service.ensureDefaultRegistrationForm(registrar, projectId)).definitions).toEqual(
      [],
    )
  })

  it('lists the template only when no project-authored registration form is eligible', async () => {
    await service.registrationContext(registrar, projectId)
    expect(tx.digitalForm.groupBy.mock.calls.map(([args]) => args.where.systemTemplateKey)).toEqual(
      [null, 'SYSTEM_DEFAULT_REGISTRATION_V1'],
    )
    expect(tx.digitalForm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          projectId,
          systemTemplateKey: 'SYSTEM_DEFAULT_REGISTRATION_V1',
          status: 'PUBLISHED',
          archivedAt: null,
        }),
      }),
    )

    vi.clearAllMocks()
    tx.digitalForm.groupBy.mockResolvedValue([{ code: 'registration', _max: { version: 3 } }])
    tx.digitalForm.findMany.mockResolvedValue([definitionRow(customId, 'registration')])
    const context = await service.registrationContext(registrar, projectId)
    expect(tx.digitalForm.groupBy).toHaveBeenCalledOnce()
    expect(tx.digitalForm.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ systemTemplateKey: null }),
      }),
    )
    expect(context.definitions.map((definition) => definition.id)).toEqual([customId])
  })
})
