import 'reflect-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import { BeneficiariesController } from './beneficiaries.controller'
import { BeneficiariesService } from './beneficiaries.service'
const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const formId = '40000000-0000-4000-8000-000000000004'

const actor: ApplicationIdentity = {
  id: '90000000-0000-4000-8000-000000000009',
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic M&E actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: [
    'beneficiaries.records.read',
    'beneficiaries.records.register',
    'beneficiaries.profiles.update',
    'beneficiaries.enrollments.manage',
    'beneficiaries.identities.review',
  ],
  assignedProjectIds: [projectId],
}

const field = (code: string, dataType: string, required = false, allowedValues?: string[]) => ({
  id: `${code}-field`,
  code,
  label: code,
  dataType,
  isRequired: required,
  allowedValues: allowedValues ?? null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  sequenceNo: 1,
})

const fields = [
  field('registration_operation', 'SELECT', true, ['CREATE', 'LINK', 'UPDATE']),
  field('beneficiary_code', 'TEXT', true),
  field('subject_type', 'SELECT', true, ['INDIVIDUAL', 'GROUP', 'COMMUNITY']),
  field('display_name', 'TEXT'),
  field('first_name', 'TEXT'),
  field('middle_name', 'TEXT'),
  field('last_name', 'TEXT'),
  field('sex', 'SELECT', false, ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED']),
  field('birth_date', 'DATE'),
  field('age_at_registration', 'INTEGER'),
  field('disability_status', 'SELECT', false, [
    'WITH_DISABILITY',
    'WITHOUT_DISABILITY',
    'NOT_SPECIFIED',
  ]),
  field('location_barangay', 'TEXT'),
  field('location_city_municipality', 'TEXT'),
  field('location_province', 'TEXT'),
  field('consent_recorded', 'BOOLEAN', true),
  field('data_processing_consent_recorded', 'BOOLEAN', true),
  field('is_minor', 'BOOLEAN'),
  field('guardian_consent_recorded', 'BOOLEAN'),
  field('enrollment_date', 'DATE', true),
  field('external_identifier_type', 'TEXT'),
  field('external_identifier_value', 'TEXT'),
  field('profile_update_fields', 'MULTIPLE_SELECT', false, [
    'display_name',
    'first_name',
    'middle_name',
    'last_name',
    'sex',
    'birth_date',
    'age_at_registration',
    'disability_status',
    'location_barangay',
    'location_city_municipality',
    'location_province',
  ]),
]

const wrapper = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../auth/authorized-operation', () => ({ withAuthorizedOperation: wrapper.run }))
vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))
const tx = { project: { findFirst: vi.fn() }, digitalForm: { groupBy: vi.fn(), findMany: vi.fn() } }
const definition = () => ({
  id: formId,
  code: 'registration',
  version: 2,
  name: 'Registration',
  formType: 'BENEFICIARY_REGISTRATION',
  status: 'PUBLISHED',
  formField_form: fields.map((field, index) => ({
    ...field,
    sequenceNo: index + 1,
    isMetadataKey: false,
    isSadddField: false,
  })),
  createdById: 'secret-author',
  description: 'private',
  submissions: [{ value: 'private' }],
})
let service: BeneficiariesService
beforeEach(() => {
  vi.clearAllMocks()
  service = new BeneficiariesService({} as PrismaService)
  tx.project.findFirst.mockResolvedValue({ id: projectId })
  tx.digitalForm.groupBy.mockResolvedValue([{ code: 'registration', _max: { version: 2 } }])
  tx.digitalForm.findMany.mockResolvedValue([definition()])
  wrapper.run.mockImplementation((_prisma, identity, _permission, callback) =>
    callback(tx, identity),
  )
})
describe('supporting registration context, mocked authorized wrapper', () => {
  it('uses registration metadata instead of collection or forms permissions', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEY, BeneficiariesController.prototype.registrationContext),
    ).toBe('beneficiaries.records.register')
    expect(Reflect.getMetadata('path', BeneficiariesController.prototype.registrationContext)).toBe(
      'registration-context',
    )
  })
  it.each(['PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_MANAGER'])(
    'requests existing register chain and scopes before reading for %s',
    async (role) => {
      await service.registrationContext({ ...actor, roles: [role] as never }, projectId)
      expect(wrapper.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'beneficiaries.records.register',
        expect.any(Function),
      )
      expect(tx.digitalForm.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId,
            projectId,
            status: 'PUBLISHED',
            archivedAt: null,
            formType: 'BENEFICIARY_REGISTRATION',
          }),
          take: 101,
        }),
      )
      expect(tx.digitalForm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId,
            projectId,
            OR: [{ code: 'registration', version: 2 }],
          }),
          take: 101,
        }),
      )
    },
  )
  it('returns explicit blank definition allowlist with no internal identities/defaults/data', async () => {
    const result = await service.registrationContext(actor, projectId)
    expect(Object.keys(result).sort()).toEqual(['businessDate', 'definitions', 'projectId'])
    expect(Object.keys(result.definitions[0]).sort()).toEqual([
      'code',
      'fields',
      'formType',
      'id',
      'name',
      'status',
      'version',
    ])
    expect(JSON.stringify(result)).not.toMatch(
      /secret-author|private|submissions|createdById|description/,
    )
    expect(result.definitions[0].fields[0]).toEqual(
      expect.objectContaining({ metadataKey: false, sadddField: false, sequence: 1 }),
    )
  })
  it('returns empty definitions without a detail read', async () => {
    tx.digitalForm.groupBy.mockResolvedValue([])
    expect((await service.registrationContext(actor, projectId)).definitions).toEqual([])
    expect(tx.digitalForm.findMany).not.toHaveBeenCalled()
  })
  it('rejects inaccessible project before definition reads', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.registrationContext(actor, projectId)).rejects.toMatchObject({
      status: 404,
    })
    expect(tx.digitalForm.groupBy).not.toHaveBeenCalled()
  })
  it('rejects malformed project input with400 before wrapper', () => {
    expect(() => service.registrationContext(actor, 'not-a-uuid')).toThrow(
      'Project identifier is invalid.',
    )
    expect(wrapper.run).not.toHaveBeenCalled()
  })
  it('propagates denied/revoked authorization without definition reads', async () => {
    wrapper.run.mockRejectedValue({ status: 403 })
    await expect(service.registrationContext(actor, projectId)).rejects.toMatchObject({
      status: 403,
    })
    expect(tx.digitalForm.groupBy).not.toHaveBeenCalled()
  })
  it.each([
    'codes',
    'fields',
    'options',
    'malformed-options',
    'malformed-type',
    'missing-latest',
    'oversize-name',
    'oversize-label',
    'oversize-option',
  ])('rejects invalid or overflow %s with409', async (mode) => {
    const form = definition()
    if (mode === 'codes')
      tx.digitalForm.groupBy.mockResolvedValue(
        Array.from({ length: 101 }, (_, i) => ({ code: `REG${i}`, _max: { version: 1 } })),
      )
    if (mode === 'fields') form.formField_form = Array(101).fill(form.formField_form[0])
    if (mode === 'options') form.formField_form[0].allowedValues = Array(101).fill('x')
    if (mode === 'malformed-options') form.formField_form[0].allowedValues = [123] as never
    if (mode === 'oversize-name') form.name = 'x'.repeat(161)
    if (mode === 'oversize-label') form.formField_form[0].label = 'x'.repeat(161)
    if (mode === 'oversize-option') form.formField_form[0].allowedValues = ['x'.repeat(121)]
    if (mode === 'malformed-type') form.formField_form[0].dataType = 'EXECUTABLE'
    tx.digitalForm.findMany.mockResolvedValue(mode === 'missing-latest' ? [] : [form])
    await expect(service.registrationContext(actor, projectId)).rejects.toMatchObject({
      status: 409,
    })
  })
})
