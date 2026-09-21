import { describe, expect, it } from 'vitest'

import { activityMonitoringDefinitionErrors } from './activity-monitoring'
import type { FormFieldValidationContract } from './form-data'

const fields: FormFieldValidationContract[] = [
  { code: 'beneficiary_code', label: 'Beneficiary code', dataType: 'TEXT', required: true },
  { code: 'participation_date', label: 'Participation date', dataType: 'DATE', required: true },
  {
    code: 'attendance_status',
    label: 'Attendance status',
    dataType: 'SELECT',
    required: true,
    allowedValues: ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'],
  },
  {
    code: 'progress_status',
    label: 'Progress status',
    dataType: 'SELECT',
    required: true,
    allowedValues: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_FOLLOW_UP'],
  },
  { code: 'progress_notes', label: 'Progress notes', dataType: 'LONG_TEXT', required: false },
]

describe('activity monitoring definition', () => {
  it('accepts the canonical participation contract', () => {
    expect(activityMonitoringDefinitionErrors(fields)).toEqual([])
  })

  it('rejects missing required fields', () => {
    expect(
      activityMonitoringDefinitionErrors(
        fields.filter((field) => field.code !== 'progress_status'),
      ),
    ).toEqual([
      expect.objectContaining({ fieldCode: 'progress_status', code: 'invalid_definition' }),
    ])
  })

  it('rejects incompatible types and select options', () => {
    const invalid = fields.map((field) =>
      field.code === 'participation_date'
        ? { ...field, dataType: 'TEXT' as const }
        : field.code === 'attendance_status'
          ? { ...field, allowedValues: ['PRESENT', 'ABSENT'] }
          : field,
    )
    const errors = activityMonitoringDefinitionErrors(invalid)
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldCode: 'participation_date' }),
        expect.objectContaining({ fieldCode: 'attendance_status' }),
      ]),
    )
  })
})
