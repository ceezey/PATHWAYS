import type { BuilderFieldType, BuilderFormField } from './forms/digital-form-contract'
import type { MappingStatus } from './import/collection-import-state'

export type CollectionMode = 'scratch' | 'import' | 'extend'

/** The read-only Data preview and Metadata mapping tables render at most this many rows. */
export const MAX_PREVIEW_ROWS = 5
export type CollectionView = 'home' | 'forms' | 'builder' | 'import'
export type FieldType = BuilderFieldType
export type ImportStatus = 'idle' | 'reading' | 'ready' | 'error'

export type FormField = BuilderFormField

export interface ParsedImport {
  fileName: string
  fileType: 'csv' | 'xlsx'
  headers: string[]
  rows: Record<string, unknown>[]
  errors: string[]
  sheetNames?: string[]
}

export interface SavedForm {
  id: string
  title: string
  type: string
  project: string
  fieldCount: number
  savedAt: string
}

/** Matches the activity list table header so every collection table reads the same. */
export const tableHeadClass = 'h-10 text-xs uppercase tracking-wide'

export const savedFormStatus: Record<string, { label: string; tone: 'neutral' | 'success' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
}

export const dataTypeLabels: Record<FieldType, string> = {
  text: 'Text',
  long_text: 'Long text',
  integer: 'Integer',
  decimal: 'Decimal',
  date: 'Date',
  single_select: 'Single select',
  multi_select: 'Multiple select',
  boolean: 'Yes/No',
}

export const statusTone = (status: MappingStatus) => {
  if (status === 'mapped') {
    return 'success'
  }

  if (status === 'ignored') {
    return 'neutral'
  }

  if (status === 'invalid') {
    return 'danger'
  }

  return 'warning'
}

export const formatValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

// Saved dates render as a short UTC date and fall back to the raw value when unparsable.
export const formatSavedAt = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
}
