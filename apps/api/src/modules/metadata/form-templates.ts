import type { CreateFormDto, FormFieldDto } from './metadata.dto'

type TemplateDefinition = Pick<CreateFormDto, 'formType' | 'description'> & {
  fields: FormFieldDto[]
}

const field = (
  code: string,
  label: string,
  dataType: FormFieldDto['dataType'],
  patch: Partial<FormFieldDto> = {},
): FormFieldDto => ({
  code,
  label,
  dataType,
  required: false,
  metadataKey: false,
  sadddField: false,
  ...patch,
})

/** Server-owned template catalog for `forms.generate`; clients select by key only. */
export const formTemplates = {
  training_survey: {
    formType: 'TRAINING_SURVEY',
    description: 'Post-session training feedback.',
    fields: [
      field('session_date', 'Session date', 'DATE', { required: true, metadataKey: true }),
      field('overall_rating', 'Overall rating', 'INTEGER', {
        required: true,
        minimumValue: '1',
        maximumValue: '5',
      }),
      field('comments', 'Comments', 'LONG_TEXT', { maximumLength: 2000 }),
    ],
  },
  general_monitoring: {
    formType: 'OTHER',
    description: 'General monitoring checklist.',
    fields: [
      field('visit_date', 'Visit date', 'DATE', { required: true, metadataKey: true }),
      field('status', 'Status', 'SELECT', {
        required: true,
        allowedValues: ['On track', 'Delayed', 'Blocked'],
      }),
      field('notes', 'Notes', 'LONG_TEXT', { maximumLength: 2000 }),
    ],
  },
} as const satisfies Record<string, TemplateDefinition>

export type FormTemplateKey = keyof typeof formTemplates
export const formTemplateKeys = Object.keys(formTemplates) as FormTemplateKey[]
