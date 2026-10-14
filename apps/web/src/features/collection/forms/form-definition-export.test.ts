import { describe, expect, it } from 'vitest'

import { formDefinitionExportFormats, formDefinitionExportRequest } from './form-definition-export'

const form = {
  id: '40000000-0000-4000-8000-000000000004',
  projectId: '30000000-0000-4000-8000-000000000003',
  code: 'Intake Form',
  version: 3,
}

describe('form definition export request', () => {
  it.each(formDefinitionExportFormats)('targets the audited server export for %s', (format) => {
    expect(formDefinitionExportRequest(form, format)).toEqual({
      url: `/metadata/projects/${form.projectId}/forms/${form.id}/export?format=${format.toUpperCase()}`,
      fileName: `intake-form-v3.${format}`,
    })
  })

  it('encodes identifiers and rejects formats outside the approved list', () => {
    expect(formDefinitionExportRequest({ ...form, id: 'a/b' }, 'csv').url).toContain(
      '/forms/a%2Fb/',
    )
    expect(() => formDefinitionExportRequest(form, 'docx' as 'csv')).toThrow(
      'Choose CSV, XLSX, XLS or PDF.',
    )
  })
})
