import { describe, expect, it } from 'vitest'

import type { DigitalFormDefinition } from '@/types/pathways'

import { createFormDefinitionExport } from './form-definition-export'

const form: DigitalFormDefinition = {
  id: 'form-1',
  projectId: 'project-1',
  code: 'Intake Form',
  version: 3,
  name: '=Unsafe title',
  description: null,
  formType: 'OTHER',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  updatedAt: '2026-09-23T00:00:00.000Z',
  createdByCurrentUser: true,
  fields: [
    {
      code: 'choice',
      label: 'Choice',
      dataType: 'SELECT',
      required: true,
      metadataKey: false,
      sadddField: false,
      allowedValues: ['A', 'B'],
      sequence: 2,
    },
    {
      code: 'name',
      label: '@Name',
      dataType: 'TEXT',
      required: false,
      metadataKey: true,
      sadddField: false,
      maximumLength: 80,
      sequence: 1,
    },
  ],
}

describe('form definition export', () => {
  it('exports the exact version and ordered field contract deterministically', () => {
    const first = createFormDefinitionExport(form, 'csv')
    const second = createFormDefinitionExport(form, 'csv')

    expect(second).toEqual(first)
    expect(first.fileName).toBe('intake-form-v3.csv')
    expect(first.content).toContain('"form_version"')
    expect(first.content).toContain('"3"')
    expect(first.content).toContain('"SELECT","true"')
    expect(first.content).toContain('"[""A"",""B""]"')
    expect(first.content.indexOf('"name"')).toBeLessThan(first.content.indexOf('"choice"'))
    expect(first.content).toContain('"\'=Unsafe title"')
    expect(first.content).toContain('"\'@Name"')
    expect(first.content).not.toContain('2026-09-23')
  })

  it.each(['xlsx', 'xls', 'pdf'] as const)('truthfully rejects unsupported %s export', (format) => {
    expect(() => createFormDefinitionExport(form, format)).toThrow(
      `${format.toUpperCase()} form export is not supported. Choose CSV.`,
    )
  })
})
