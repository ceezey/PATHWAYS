import type { DigitalFormType } from '@/types/pathways'

import type { CollectionMode, CollectionView, FormField } from '../collection.utils'
import { fieldCodeFromText } from './digital-form-contract'
import type { FormDefinitionExportFormat } from './form-definition-export'

export type ExportFormat = FormDefinitionExportFormat
/** The editable correction table paginates instead of capping, so every row stays correctable. */
export const CORRECTION_PAGE_SIZE = 25

export interface CollectionWorkspaceProps {
  initialMode?: CollectionMode
  initialView?: CollectionView
  initialProjectId?: string
  initialFormId?: string
}

export const toApiFormType = (type: string): DigitalFormType => type as DigitalFormType

export const initialFields: FormField[] = [
  {
    id: 'field-beneficiary-id',
    label: 'Beneficiary ID',
    code: 'beneficiary_id',
    type: 'text',
    required: true,
    metadataKey: true,
    sadddField: false,
    allowedValues: [],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    mappingStatus: 'mapped',
  },
  {
    id: 'field-attendance',
    label: 'Attendance status',
    code: 'attendance_status',
    type: 'single_select',
    required: true,
    metadataKey: false,
    sadddField: false,
    allowedValues: ['Present', 'Absent', 'Excused'],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    mappingStatus: 'mapped',
  },
  {
    id: 'field-age-band',
    label: 'Age group',
    code: 'beneficiary_age_group',
    type: 'single_select',
    required: false,
    metadataKey: false,
    sadddField: true,
    allowedValues: ['10-14', '15-17', '18-24', '25+'],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    mappingStatus: 'unmapped',
  },
]

export const modeDetails: Array<{
  id: CollectionMode
  title: string
  description: string
  href: string
}> = [
  {
    id: 'import',
    title: 'Import existing file',
    description: 'Upload CSV, XLSX, XLS, or a text-based PDF and review detected mappings.',
    href: '/collection/import',
  },
  {
    id: 'scratch',
    title: 'Build forms',
    description: 'Create fields one by one with metadata guidance.',
    href: '/collection/forms/new',
  },
  {
    id: 'extend',
    title: 'Import then extend',
    description: 'Start from detected columns and add or modify fields.',
    href: '/collection/import?mode=extend',
  },
]

export const importedFieldLabels: Record<string, string> = {
  beneficiary_id: 'Beneficiary ID',
  attendance_status: 'Attendance status',
  pre_test_score: 'Pre-test score',
  post_test_score: 'Post-test score',
  activity_date: 'Activity date',
}

export const fieldFromHeader = (header: string, index: number): FormField => {
  const code = fieldCodeFromText(header)

  return {
    id: `imported-${index}-${code}`,
    label:
      importedFieldLabels[code] ??
      header.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
    code,
    type:
      code === 'attendance_status'
        ? 'single_select'
        : code.includes('score')
          ? 'decimal'
          : code.includes('date')
            ? 'date'
            : 'text',
    required: ['beneficiary_id', 'activity_date'].includes(code),
    metadataKey: code.includes('beneficiary'),
    sadddField: ['age', 'sex', 'gender', 'disability'].some((token) => code.includes(token)),
    allowedValues: code === 'attendance_status' ? ['Present', 'Partial', 'Absent'] : [],
    minimumValue: '',
    maximumValue: '',
    minimumLength: '',
    maximumLength: '',
    // Each detected column defines this field, so it starts mapped to its own column.
    mappingStatus: code ? 'mapped' : 'invalid',
  }
}

export const formTitleFromFileName = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^pathways[\s_-]+/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || 'Imported Questionnaire'
