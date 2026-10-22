import { describe, expect, it } from 'vitest'

import { emptyIntake, fromDigitalForm, toDigitalFormInput } from './digital-form-contract'

describe('digital form builder contract', () => {
  it('preserves options containing commas and date bounds through API round trips', () => {
    const definition = {
      id: 'form-id',
      projectId: 'project-id',
      code: 'survey',
      version: 2,
      name: 'Survey',
      description: 'Saved description',
      formType: 'TRAINING_SURVEY' as const,
      status: 'DRAFT' as const,
      activityId: 'activity-id',
      journeyStageId: 'stage-id',
      updatedAt: '2026-09-13T00:00:00.000Z',
      createdByCurrentUser: true,
      fields: [
        {
          code: 'choice',
          label: 'Choice',
          dataType: 'SELECT' as const,
          required: true,
          metadataKey: true,
          sadddField: true,
          allowedValues: ['Yes, with support', 'No'],
        },
        {
          code: 'date',
          label: 'Date',
          dataType: 'DATE' as const,
          required: true,
          metadataKey: false,
          sadddField: false,
          minimumDate: '2026-01-01',
          maximumDate: '2026-12-31',
        },
      ],
    }
    const input = toDigitalFormInput({
      ...definition,
      description: definition.description,
      activityId: definition.activityId,
      journeyStageId: definition.journeyStageId,
      fields: fromDigitalForm(definition),
    })
    expect(input.fields[0]).toMatchObject({
      allowedValues: ['Yes, with support', 'No'],
      metadataKey: true,
      sadddField: true,
    })
    expect(input.fields[1]).toMatchObject({
      minimumDate: '2026-01-01',
      maximumDate: '2026-12-31',
      minimumValue: undefined,
      allowedValues: undefined,
    })
    expect(input).toMatchObject({
      code: 'survey',
      formType: 'TRAINING_SURVEY',
      activityId: 'activity-id',
      journeyStageId: 'stage-id',
      description: 'Saved description',
    })
  })

  it('maps all supported builder types and preserves explicit limits', () => {
    const types = [
      'text',
      'long_text',
      'integer',
      'decimal',
      'date',
      'boolean',
      'single_select',
      'multi_select',
    ] as const
    const input = toDigitalFormInput({
      code: 'monitoring_form',
      name: 'Monitoring form',
      formType: 'OUTCOME_MONITORING',
      fields: types.map((type, index) => ({
        id: String(index),
        code: `field_${index}`,
        label: `Field ${index}`,
        type,
        required: index === 0,
        metadataKey: false,
        sadddField: false,
        allowedValues: type.includes('select') ? ['Yes', 'No'] : [],
        minimumValue: type === 'decimal' ? '0.0000' : '',
        maximumValue: type === 'decimal' ? '10.0000' : '',
        minimumLength: type === 'text' ? '2' : '',
        maximumLength: type === 'text' ? '20' : '',
        mappingStatus: 'mapped',
        ...emptyIntake,
      })),
    })

    expect(input.fields.map((field) => field.dataType)).toEqual([
      'TEXT',
      'LONG_TEXT',
      'INTEGER',
      'DECIMAL',
      'DATE',
      'BOOLEAN',
      'SELECT',
      'MULTIPLE_SELECT',
    ])
    expect(input.fields[0]).toMatchObject({ minimumLength: 2, maximumLength: 20 })
    expect(input.fields[6].allowedValues).toEqual(['Yes', 'No'])
    expect(input.fields[3]).toMatchObject({ minimumValue: '0.0000', maximumValue: '10.0000' })
  })

  it('rehydrates a persisted definition without changing its semantics', () => {
    const fields = fromDigitalForm({
      id: 'form-id',
      projectId: 'project-id',
      code: 'survey',
      version: 2,
      name: 'Survey',
      description: null,
      formType: 'TRAINING_SURVEY',
      status: 'DRAFT',
      activityId: null,
      journeyStageId: null,
      updatedAt: '2026-09-13T00:00:00.000Z',
      createdByCurrentUser: true,
      fields: [
        {
          id: 'field-id',
          code: 'choice',
          label: 'Choice',
          dataType: 'MULTIPLE_SELECT',
          required: false,
          metadataKey: true,
          sadddField: false,
          allowedValues: ['A', 'B'],
          minimumLength: null,
          maximumLength: 2,
        },
      ],
    })

    expect(fields[0]).toMatchObject({
      type: 'multi_select',
      allowedValues: ['A', 'B'],
      maximumLength: '2',
      metadataKey: true,
    })
  })
  it('carries intake metadata both ways and drops incomplete entries', () => {
    const response = {
      id: 'form-id',
      projectId: 'project-id',
      code: 'registration',
      version: 2,
      name: 'Registration',
      description: null,
      formType: 'BENEFICIARY_REGISTRATION' as const,
      status: 'DRAFT' as const,
      activityId: null,
      journeyStageId: null,
      updatedAt: '2026-10-23T00:00:00.000Z',
      createdByCurrentUser: true,
      fields: [
        {
          id: 'sex-id',
          code: 'sex',
          label: 'Sex',
          dataType: 'SELECT' as const,
          required: true,
          metadataKey: false,
          sadddField: true,
          allowedValues: ['Male', 'Female'],
          minimumLength: null,
          maximumLength: null,
          sourceNames: ['Gender'],
          valueAliases: [{ from: 'M', to: 'Male' }],
          importDefault: 'Male',
          rule: {
            kind: 'AGE_AT_DATE' as const,
            birthField: 'birth_date',
            atField: 'enrollment_date',
          },
        },
      ],
    }
    const fields = fromDigitalForm(response)
    expect(fields[0]).toMatchObject({
      sourceNames: ['Gender'],
      valueAliases: [{ from: 'M', to: 'Male' }],
      importDefault: 'Male',
      rule: { kind: 'AGE_AT_DATE' },
    })
    const [sent] = toDigitalFormInput({
      code: response.code,
      name: response.name,
      formType: response.formType,
      fields: [
        {
          ...fields[0],
          sourceNames: [' Gender ', ' '],
          valueAliases: [
            { from: 'M', to: 'Male' },
            { from: '', to: 'Female' },
          ],
          importDefault: ' ',
          rule: null,
        },
      ],
    }).fields
    expect(sent).toMatchObject({
      sourceNames: ['Gender'],
      valueAliases: [{ from: 'M', to: 'Male' }],
    })
    expect(sent.importDefault).toBeUndefined()
    expect(sent.rule).toBeUndefined()
  })

  it('sends value aliases only for choice fields', () => {
    const [sent] = toDigitalFormInput({
      code: 'f',
      name: 'F',
      formType: 'OTHER',
      fields: [
        {
          id: '1',
          code: 'age',
          label: 'Age',
          type: 'integer',
          required: false,
          metadataKey: false,
          sadddField: false,
          allowedValues: [],
          minimumValue: '',
          maximumValue: '',
          minimumLength: '',
          maximumLength: '',
          mappingStatus: 'mapped',
          ...emptyIntake,
          valueAliases: [{ from: 'x', to: 'y' }],
        },
      ],
    }).fields
    expect(sent.valueAliases).toBeUndefined()
  })
})
