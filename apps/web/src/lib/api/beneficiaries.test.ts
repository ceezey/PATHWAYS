// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import { beneficiaryRegistrationFieldRules } from '@pathways/shared'
import { beneficiariesClient } from './beneficiaries'

const projectId = '79400000-0000-4000-8000-000000000001'
const beneficiaryId = '79400000-0000-4000-8000-000000000002'
const formId = '79400000-0000-4000-8000-000000000003'
const registrationId = '79400000-0000-4000-8000-000000000004'
const cursor = '79400000-0000-4000-8000-000000000005'
const otherId = '79400000-0000-4000-8000-000000000006'
const base = `/beneficiaries/projects/${projectId}`

const row = {
  id: beneficiaryId,
  code: 'BEN-S4B-001',
  subjectType: 'INDIVIDUAL',
  displayName: 'Fictional Person',
  firstName: 'Fictional',
  middleName: null,
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  birthDate: '2000-01-01',
  ageAtRegistration: 26,
  disabilityStatus: 'NOT_SPECIFIED',
  locationBarangay: 'Fictional Barangay',
  locationCityMunicipality: 'Fictional City',
  locationProvince: 'Fictional Province',
  status: 'ACTIVE',
  consentRecorded: true,
  dataProcessingConsentRecorded: true,
  isMinor: false,
  guardianConsentRecorded: false,
  projectId,
  enrollment: { id: formId, projectId, enrollmentDate: '2026-06-01', status: 'ACTIVE' },
  consentProvenance: [
    { kind: 'PARTICIPATION', source: 'DIRECT_ENTRY', recordedAt: '2026-06-01T00:00:00.000Z' },
  ],
  updatedAt: '2026-06-01T00:00:00.000Z',
}
const contributor = {
  ...row,
  enrollment: { projectId, status: 'ACTIVE', endedDate: null },
}
const context = {
  projectId,
  businessDate: '2026-09-27',
  definitions: [
    {
      id: formId,
      code: 'registration',
      name: 'Registration',
      version: 1,
      formType: 'BENEFICIARY_REGISTRATION',
      status: 'PUBLISHED',
      fields: Object.entries(beneficiaryRegistrationFieldRules).map(([code, rule], index) => ({
        id: `79400000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
        code,
        label: code,
        dataType: rule.dataType,
        required: 'required' in rule ? rule.required : false,
        metadataKey: false,
        sadddField: false,
        sequence: index + 1,
        allowedValues: 'allowedValues' in rule ? [...rule.allowedValues] : null,
      })),
    },
  ],
}

// The same cases run against the PathwaysClient methods until Task 3 removes them.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['beneficiariesClient', beneficiariesClient],
] as const

describe.each(clients)('%s beneficiary requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('returns no records without a project and sends the filters of the first page', async () => {
    await expect(client.getBeneficiaryRecordsForRole('Project Officer')).resolves.toEqual([])
    expect(request.requestFoundation).not.toHaveBeenCalled()
    request.requestFoundation.mockResolvedValue({ items: [row], nextCursor: null })
    const records = await client.getBeneficiaryRecordsForRole('Project Officer', projectId, {
      search: ' BEN ',
      sex: 'FEMALE',
      ageBand: '25+',
      disabilityStatus: 'NOT_SPECIFIED',
      enrollmentStatus: 'ACTIVE',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}?search=BEN&sex=FEMALE&ageBand=25%2B&disabilityStatus=NOT_SPECIFIED&enrollmentStatus=ACTIVE&limit=50`,
    )
    expect(records).toStrictEqual([
      {
        id: beneficiaryId,
        code: 'BEN-S4B-001',
        subjectType: 'INDIVIDUAL',
        displayName: 'Fictional Person',
        projectIds: [projectId],
        location: 'Fictional Barangay, Fictional City, Fictional Province',
        sex: 'Not specified',
        ageGroup: '25+',
        disabilityStatus: 'Not specified',
        enrollmentStatus: 'Active',
        firstName: 'Fictional',
        middleName: undefined,
        lastName: 'Person',
        birthDate: '2000-01-01',
        age: 26,
        province: 'Fictional Province',
        city: 'Fictional City',
        barangay: 'Fictional Barangay',
        consentToParticipate: true,
        consentToStoreData: true,
        isMinor: false,
        guardianConsent: false,
        enrollments: [
          {
            id: formId,
            projectId,
            status: 'Active',
            enrolledAt: '2026-06-01',
            followUpStatus: 'Not recorded',
          },
        ],
        participation: [],
        assessments: [],
        notes: [],
        updatedAt: '2026-06-01T00:00:00.000Z',
        consentProvenance: row.consentProvenance,
      },
    ])
  })

  it('follows the cursor to the last page and refuses a repeated cursor', async () => {
    request.requestFoundation
      .mockResolvedValueOnce({ items: [row], nextCursor: cursor })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    await expect(
      client.getBeneficiaryRecordsForRole('Project Officer', projectId),
    ).resolves.toHaveLength(1)
    expect(request.requestFoundation.mock.calls.map(([path]) => path)).toEqual([
      `${base}?limit=50`,
      `${base}?limit=50&cursor=${cursor}`,
    ])
    request.requestFoundation.mockReset()
    request.requestFoundation.mockResolvedValue({ items: [], nextCursor: cursor })
    await expect(client.getBeneficiaryRecordsForRole('Project Officer', projectId)).rejects.toThrow(
      'Invalid beneficiary pagination.',
    )
  })

  it('refuses a page that is not a list of at most 50 rows', async () => {
    request.requestFoundation.mockResolvedValue({ items: 'rows', nextCursor: null })
    await expect(client.getBeneficiaryRecordsForRole('Project Officer', projectId)).rejects.toThrow(
      'Invalid beneficiary response.',
    )
    request.requestFoundation.mockResolvedValue({
      items: Array(51).fill(row),
      nextCursor: null,
    })
    await expect(client.getBeneficiaryRecordsForRole('Project Officer', projectId)).rejects.toThrow(
      'Invalid beneficiary response.',
    )
  })

  it('reads one record, registers and updates at encoded project scoped paths', async () => {
    await expect(
      client.getBeneficiaryRecordForRole('Project Officer', '', beneficiaryId),
    ).rejects.toThrow('Project scope is required.')
    expect(request.requestFoundation).not.toHaveBeenCalled()
    request.requestFoundation.mockResolvedValue(row)
    await client.getBeneficiaryRecordForRole('Project Officer', projectId, 'a b')
    const registration = { formId, clientRegistrationId: registrationId, values: { code: 'x' } }
    await client.registerBeneficiary(projectId, registration)
    const update = {
      subjectType: 'INDIVIDUAL',
      sex: 'NOT_SPECIFIED',
      disabilityStatus: 'NOT_SPECIFIED',
      expectedUpdatedAt: row.updatedAt,
    } as const
    await client.updateBeneficiary(projectId, beneficiaryId, update)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${base}/a%20b`],
      [`${base}/registrations`, { method: 'POST', body: JSON.stringify(registration) }],
      [`${base}/${beneficiaryId}`, { method: 'PATCH', body: JSON.stringify(update) }],
    ])
  })

  it('reads one bounded contributor page and refuses an invalid project before any request', async () => {
    request.requestFoundation.mockResolvedValue({ items: [contributor], nextCursor: otherId })
    const signal = new AbortController().signal
    await expect(
      client.getSurveySubjectPage(projectId, ' Fictional ', otherId, signal),
    ).resolves.toEqual({
      items: [{ id: beneficiaryId, code: 'BEN-S4B-001', displayName: 'Fictional Person' }],
      nextCursor: otherId,
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}?enrollmentStatus=ACTIVE&limit=25&search=Fictional&cursor=${otherId}`,
      { signal },
    )
    request.requestFoundation.mockClear()
    await expect(client.getSurveySubjectPage('bad')).rejects.toThrow('Invalid contributor search.')
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('lists duplicate candidates as sent and posts the decision', async () => {
    const pair = { left: { id: beneficiaryId }, right: { id: otherId } }
    request.requestFoundation.mockResolvedValue([pair])
    await expect(client.getDuplicateCandidates(projectId)).resolves.toEqual([pair])
    const decision = { leftId: beneficiaryId, rightId: otherId, decision: 'LINK' } as const
    await client.resolveDuplicate(projectId, decision)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${base}/duplicate-candidates`],
      [`${base}/duplicate-candidates/resolve`, { method: 'POST', body: JSON.stringify(decision) }],
    ])
  })

  it('reads the registration context, provisions the default form and refuses a bad context', async () => {
    await expect(client.getBeneficiaryRegistrationContext('')).rejects.toThrow(
      'Project scope is required.',
    )
    await expect(client.ensureDefaultRegistrationForm('')).rejects.toThrow(
      'Project scope is required.',
    )
    expect(request.requestFoundation).not.toHaveBeenCalled()
    request.requestFoundation.mockResolvedValue(context)
    await expect(client.getBeneficiaryRegistrationContext(projectId)).resolves.toMatchObject({
      projectId,
      businessDate: '2026-09-27',
    })
    await client.ensureDefaultRegistrationForm(projectId)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${base}/registration-context`],
      [`${base}/registration-context/default-form`, { method: 'POST' }],
    ])
    request.requestFoundation.mockResolvedValue({ ...context, actorId: 'private' })
    await expect(client.getBeneficiaryRegistrationContext(projectId)).rejects.toMatchObject({
      message: 'Invalid registration context response.',
      code: 'network',
    })
  })
})
