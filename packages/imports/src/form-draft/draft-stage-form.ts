import { CONSENT_FIELD_CODES, type FilePart, type FormFieldRequest } from '@pathways/shared'

import type { SmartMatchDecision } from '../mappers/smart-match'
import {
  type DraftColumn,
  type DraftField,
  type DraftSummary,
  FormDraftError,
  draftFormFromImport,
} from './draft-form'
import { sourceNameFree } from './draft-rules'
import { fieldCodeFromHeader } from './field-code'

type SeedType = 'DATE' | 'BOOLEAN' | 'TEXT' | 'INTEGER'

// The identity block and score a stage survey repeats, matched on the label; middle name is listed before first name.
const SEEDS: ReadonlyArray<readonly [string, SeedType, RegExp]> = [
  ['stage_consent', 'BOOLEAN', /^consent/],
  ['external_identifier_value', 'TEXT', /student id|barangay certificate/],
  ['middle_name', 'TEXT', /^gitnang pangalan|^middle name/],
  ['first_name', 'TEXT', /^pangalan|^first name/],
  ['last_name', 'TEXT', /^apelyido|^last name/],
  ['total_score', 'INTEGER', /^total score/],
]
const FIELD_CAP = 100

const hasValue = (column: DraftColumn) =>
  column.values.some((value) => !(value == null || (typeof value === 'string' && !value.trim())))

/**
 * Drafts the TRAINING_SURVEY form of one part of a participant file: the stage date and identity block are
 * seeded by position and label, and every other column goes through the ordinary import drafter.
 * shortcut: a column with no label and no way to name it is skipped; upgrade if a file shows one.
 */
export function draftStageForm(input: {
  part: FilePart
  columns: readonly DraftColumn[]
  uploadDate: string
}): {
  definition: {
    code: string
    name: string
    formType: 'TRAINING_SURVEY'
    fields: FormFieldRequest[]
  }
  summary: DraftSummary
} {
  const seeded: Array<DraftField & { column: DraftColumn }> = []
  const seed = (column: DraftColumn, code: string, dataType: SeedType) =>
    seeded.push({
      id: code,
      code,
      label: column.header.trim().slice(0, 160),
      dataType,
      required: false,
      metadataKey: false,
      sadddField: false,
      sourceNames: [column.sourceCode ?? column.header.trim()],
      column,
    })
  input.columns.forEach((column, index) => {
    const label = column.header.trim().toLowerCase()
    if (index === 0) return seed(column, 'stage_date', 'DATE')
    const found = SEEDS.find(
      ([code, , pattern]) => pattern.test(label) && !seeded.some((field) => field.code === code),
    )
    if (found) seed(column, found[0], found[1])
  })
  const seededKeys = new Set(seeded.map(({ column }) => column.key))
  const rest = input.columns.filter((column) => !seededKeys.has(column.key) && column.header.trim())
  const withValues = rest.filter(hasValue)

  let fields: FormFieldRequest[] = seeded.map(({ id, column, ...field }) => field)
  let summary: DraftSummary = {
    addedFields: [],
    sourceNamesAdded: [],
    optionsAdded: [],
    aliasesAdded: 0,
    defaults: [],
    rules: [],
    needsCheck: [],
  }
  if (withValues.length) {
    const decision = (column: DraftColumn, target?: string): SmartMatchDecision => ({
      sourceKey: column.key,
      columnIndex: column.columnIndex,
      status: target ? 'MAPPED' : 'PENDING',
      targetFieldId: target ?? null,
      suggestedFieldId: null,
      score: null,
      matchReason: null,
      reason: target ? 'AUTO_MATCH' : 'NO_MATCH',
    })
    const drafted = draftFormFromImport({
      formType: 'TRAINING_SURVEY',
      fields: seeded.map(({ column, ...field }) => field),
      columns: [...seeded.map(({ column }) => column), ...withValues],
      decisions: [
        ...seeded.map(({ column, id }) => decision(column, id)),
        ...withValues.map((column) => decision(column)),
      ],
      uploadDate: input.uploadDate,
    })
    fields = drafted.fields
    summary = drafted.summary
  }
  summary.addedFields = [...seeded.map((field) => field.code), ...summary.addedFields]

  // A column with no answers still keeps its place, as a text field.
  const taken = new Set<string>([...fields.map((field) => field.code), ...CONSENT_FIELD_CODES])
  for (const column of rest.filter((item) => !hasValue(item))) {
    const name = column.sourceCode ?? column.header.trim()
    const field: FormFieldRequest = {
      code: fieldCodeFromHeader(column.header, taken),
      label: column.header.trim().slice(0, 160),
      dataType: 'TEXT',
      required: false,
      metadataKey: false,
      sadddField: false,
      ...(sourceNameFree(fields, name) ? { sourceNames: [name] } : {}),
    }
    fields.push(field)
    summary.addedFields.push(field.code)
  }
  if (fields.length > FIELD_CAP) throw new FormDraftError('FIELD_LIMIT')

  // Nothing here knows the answer key, so a score that holds values waits for a person to mark it.
  const score = seeded.find((field) => field.code === 'total_score')
  if (score && hasValue(score.column))
    summary.needsCheck.push({ fieldCode: 'total_score', reason: 'ANSWER_KEY_NEEDED' })

  return {
    definition: {
      // shortcut: the code and name are not slugged because part codes are DHIS2 UIDs, upgrade if parts can carry other text
      code: `stage_${input.part.code.toLowerCase()}`,
      name: input.part.name,
      formType: 'TRAINING_SURVEY',
      fields,
    },
    summary,
  }
}
