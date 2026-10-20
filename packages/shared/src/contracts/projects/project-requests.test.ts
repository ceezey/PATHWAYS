import { describe, expect, it } from 'vitest'

import { createProjectRequest, updateProjectRequest } from './project-requests'

const base = { title: 'Synthetic project', status: 'PLANNED' }
const mutation = {
  clientMutationId: '10000000-0000-4000-8000-000000000001',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}

describe('project request contracts', () => {
  it('normalizes the code and title and coerces the beneficiary count as the DTO did', () => {
    expect(
      createProjectRequest.parse({
        ...base,
        title: '  Synthetic project  ',
        code: ' crl-ns-2026 ',
        targetBeneficiaries: '250',
        projectBudget: ' 125000.50 ',
      }),
    ).toEqual({
      ...base,
      code: 'CRL-NS-2026',
      targetBeneficiaries: 250,
      projectBudget: '125000.50',
    })
  })

  it('keeps null on the optional fields the DTO let through', () => {
    const nulls = {
      code: null,
      description: null,
      implementingPartnerNames: null,
      targetBeneficiaries: null,
      projectManagerId: null,
      startDate: null,
      programId: null,
    }
    expect(createProjectRequest.parse({ ...base, ...nulls })).toEqual({ ...base, ...nulls })
  })

  it.each([
    { targetGoal: 1 },
    { implementingPartners: 'Partner A' },
    { projectBudget: null },
    { projectOfficerIds: null },
    { projectOfficerIds: [mutation.clientMutationId, mutation.clientMutationId] },
    { startDate: '2026-02-30' },
    { status: 'ACTIVE' },
    { code: '-AB' },
    JSON.parse('{"__proto__":{"a":1}}'),
    { constructor: { a: 1 } },
  ])('rejects %j on create', (extra) => {
    expect(createProjectRequest.safeParse({ ...base, ...extra }).success).toBe(false)
  })

  it('requires the mutation keys on update only', () => {
    expect(updateProjectRequest.safeParse({ ...base, ...mutation }).success).toBe(true)
    expect(updateProjectRequest.safeParse(base).success).toBe(false)
    expect(createProjectRequest.safeParse({ ...base, ...mutation }).success).toBe(false)
  })
})
