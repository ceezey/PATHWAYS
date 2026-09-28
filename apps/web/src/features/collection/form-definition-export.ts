import type { DigitalFormDefinition } from '@/types/pathways'

export type FormDefinitionExportFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'

export const formDefinitionExportFormats: readonly FormDefinitionExportFormat[] = [
  'csv',
  'xlsx',
  'xls',
  'pdf',
]

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'form'

/**
 * The server renders, bounds and audits every form-definition export under
 * forms.export. The browser only names the request and the saved file.
 */
export function formDefinitionExportRequest(
  form: Pick<DigitalFormDefinition, 'id' | 'projectId' | 'code' | 'version'>,
  format: FormDefinitionExportFormat,
) {
  if (!formDefinitionExportFormats.includes(format)) {
    throw new Error('Choose CSV, XLSX, XLS or PDF.')
  }
  return {
    url: `/metadata/projects/${encodeURIComponent(form.projectId)}/forms/${encodeURIComponent(form.id)}/export?format=${format.toUpperCase()}`,
    fileName: `${slug(form.code)}-v${form.version}.${format}`,
  }
}
