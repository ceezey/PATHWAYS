import { beneficiaryRegistrationFieldRules } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { parseRegistrationContext } from './registration-context'
const projectId = '30000000-0000-4000-8000-000000000003'
const fixture = () => ({
  projectId,
  businessDate: '2026-09-27',
  definitions: [
    {
      id: '40000000-0000-4000-8000-000000000004',
      code: 'registration',
      name: 'Registration',
      version: 1,
      formType: 'BENEFICIARY_REGISTRATION',
      status: 'PUBLISHED',
      fields: Object.entries(beneficiaryRegistrationFieldRules).map(([code, rule], index) => ({
        id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
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
})
describe('registration context output validation', () => {
  it('accepts complete typed blank definitions and empty eligible results', () => {
    expect(parseRegistrationContext(fixture(), projectId).definitions).toHaveLength(1)
    expect(
      parseRegistrationContext(
        { projectId, businessDate: '2026-09-27', definitions: [] },
        projectId,
      ).definitions,
    ).toEqual([])
  })
  it.each([
    'scope',
    'private-root',
    'private-definition',
    'private-field',
    'overflow',
    'invalid-date',
    'invalid-month',
    'invalid-range',
    'invalid-definition',
    'duplicate-code',
  ])('rejects %s instead of passing sensitive/invalid output', (mode) => {
    const value = fixture()
    if (mode === 'scope') value.projectId = '30000000-0000-4000-8000-000000000099'
    if (mode === 'private-root') Object.assign(value, { actorId: 'private' })
    if (mode === 'private-definition')
      Object.assign(value.definitions[0], { createdById: 'private' })
    if (mode === 'private-field')
      Object.assign(value.definitions[0].fields[0], { defaultValue: 'private' })
    if (mode === 'overflow') value.definitions = Array(101).fill(value.definitions[0])
    if (mode === 'invalid-date') value.businessDate = '2026-02-30'
    if (mode === 'invalid-month') value.businessDate = '2026-99-99'
    if (mode === 'invalid-range') value.businessDate = '9999-99-99'
    if (mode === 'invalid-definition') value.definitions[0].fields[0].code = '__proto__'
    if (mode === 'duplicate-code')
      value.definitions.push({
        ...value.definitions[0],
        id: '40000000-0000-4000-8000-000000000005',
      })
    expect(() => parseRegistrationContext(value, projectId)).toThrow(
      'Invalid registration context response.',
    )
  })
})
