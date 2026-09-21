import { describe, expect, it } from 'vitest'

import {
  beneficiaryRegistrationDefinitionErrors,
  beneficiaryRegistrationFieldRules,
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
