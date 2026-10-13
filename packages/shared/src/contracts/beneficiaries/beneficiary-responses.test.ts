import { describe, expect, it } from 'vitest'

import {
  archiveBeneficiaryResponse,
  beneficiaryProgressResponse,
  beneficiaryResponse,
  duplicateCandidatePairResponse,
} from './beneficiary-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const beneficiary = {
  id: uuid,
  code: 'B-001',
  subjectType: 'INDIVIDUAL',
  displayName: 'Fictional Person',
  firstName: 'Fictional',
  middleName: null,
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  birthDate: '2010-04-02',
  ageAtRegistration: null,
  disabilityStatus: 'NOT_SPECIFIED',
  locationBarangay: null,
  locationCityMunicipality: null,
  locationProvince: null,
  status: 'ACTIVE',
  consentRecorded: true,
  dataProcessingConsentRecorded: true,
  isMinor: true,
  guardianConsentRecorded: true,
  projectId: uuid,
  enrollment: {
    id: uuid,
    projectId: uuid,
    enrollmentDate: '2026-09-01',
    status: 'ACTIVE',
    endReason: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  consentProvenance: [
    { kind: 'PARTICIPATION', source: 'DIRECT_ENTRY', recordedAt: '2026-09-01T00:00:00.000Z' },
  ],
  updatedAt: '2026-09-01T00:00:00.000Z',
}

describe('beneficiary response contracts', () => {
  it('accepts a register or update row without progress and a list row with either progress form', () => {
    expect(beneficiaryResponse.safeParse(beneficiary).success).toBe(true)
    const restricted = { ...beneficiary, progress: { restricted: true } }
    expect(beneficiaryResponse.safeParse(restricted).success).toBe(true)
    const open = {
      ...beneficiary,
      progress: {
        restricted: false,
        lastParticipation: { activityId: uuid, title: 'Workshop', date: '2026-09-02' },
        stage: { code: 'ENTRY', name: 'Entry', progressPercent: 50 },
      },
    }
    expect(beneficiaryResponse.safeParse(open).success).toBe(true)
  })

  it('rejects an unrestricted progress without its stage and an unknown sex', () => {
    expect(beneficiaryProgressResponse.safeParse({ restricted: false }).success).toBe(false)
    expect(beneficiaryResponse.safeParse({ ...beneficiary, sex: 'FEMALE ' }).success).toBe(false)
  })

  it('accepts the archive answer and a duplicate pair', () => {
    const archived = { id: uuid, status: 'ARCHIVED', archivedAt: '2026-09-03T00:00:00.000Z' }
    expect(archiveBeneficiaryResponse.safeParse(archived).success).toBe(true)
    const profile = {
      id: uuid,
      code: 'B-001',
      name: 'Fictional Person',
      birthDate: '2010-04-02',
      location: '',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    expect(
      duplicateCandidatePairResponse.safeParse({ left: profile, right: profile }).success,
    ).toBe(true)
  })
})
