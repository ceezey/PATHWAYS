import { describe, expect, it } from 'vitest'

import {
  beneficiaryAgeRuleMessages,
  beneficiaryRegistrationDefinitionErrors,
  beneficiaryRegistrationFieldRules,
  completedYearsAt,
  minimumBeneficiaryAge,
} from './beneficiary-registration'
import type { FormFieldValidationContract } from './form-data'

const fields = Object.entries(beneficiaryRegistrationFieldRules).map<FormFieldValidationContract>(
  ([code, rule]) => ({
    code,
    label: code,
    dataType: rule.dataType,
    required: 'required' in rule ? rule.required : false,
    allowedValues: 'allowedValues' in rule ? rule.allowedValues : null,
  }),
)

describe('beneficiary registration definition', () => {
  it('accepts the canonical field contract', () => {
    expect(beneficiaryRegistrationDefinitionErrors(fields)).toEqual([])
  })

  it('reports missing, incorrectly typed and incompatible option fields precisely', () => {
    const invalid = fields
      .filter((field) => field.code !== 'beneficiary_code')
      .map((field) =>
        field.code === 'enrollment_date'
          ? { ...field, dataType: 'DECIMAL' as const }
          : field.code === 'sex'
            ? { ...field, allowedValues: ['Male', 'Female'] }
            : field.code === 'guardian_consent_recorded'
              ? { ...field, dataType: 'SELECT' as const, allowedValues: ['Yes', 'No'] }
              : field,
      )

    expect(beneficiaryRegistrationDefinitionErrors(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldCode: 'beneficiary_code' }),
        expect.objectContaining({ fieldCode: 'sex' }),
        expect.objectContaining({ fieldCode: 'guardian_consent_recorded' }),
        expect.objectContaining({ fieldCode: 'enrollment_date' }),
      ]),
    )
  })
})

describe('beneficiary minimum age rule', () => {
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`)

  it('fixes the developer-approved minimum and exact messages', () => {
    expect(minimumBeneficiaryAge).toBe(5)
    expect(beneficiaryAgeRuleMessages).toEqual({
      futureBirthDate: 'Date of birth cannot be in the future.',
      belowMinimumAge: 'Beneficiary must be at least 5 years old.',
    })
  })

  it('counts completed years at the birthday boundary, including leap days', () => {
    expect(completedYearsAt(day('2021-09-28'), day('2026-09-28'))).toBe(5)
    expect(completedYearsAt(day('2021-09-29'), day('2026-09-28'))).toBe(4)
    expect(completedYearsAt(day('2020-02-29'), day('2025-02-28'))).toBe(4)
    expect(completedYearsAt(day('2020-02-29'), day('2025-03-01'))).toBe(5)
  })
})
