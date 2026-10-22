import { type DigitalFormType, type FormFieldRequest, valueMapText } from '@pathways/shared'
import { answerResolver, comparableAnswer, hasLetterPrefix, stripLetterPrefix } from '../answers'
import {
  SMART_REVIEW_SYNONYMS_V2,
  type SmartMatchDecision,
  normalizeMappingNameV1,
} from '../mappers/smart-match'
import { type ImportValueMapEntry, mapKey } from '../value-map'
import { suggestValueMap } from '../value-map-suggest'
import { proposeIntakeRules } from './draft-rules'
import { fieldCodeFromHeader } from './field-code'

export type DraftField = FormFieldRequest & { id?: string }

export interface DraftColumn {
  key: string
  columnIndex: number
  header: string
  /** Every staged value of the column, blanks included. */
  values: readonly unknown[]
}

export type NeedsCheckReason =
  | 'SUGGESTED_SOURCE_NAME'
  | 'ENUM_ANSWER_UNRESOLVED'
  | 'IMPORT_DEFAULT'
  | 'RULE_PROPOSED'
  | 'CONSENT_SOURCE_PROPOSED'
  | 'PARTICIPATION_CONSENT_NO_SOURCE'
  | 'IDENTIFIER_PROPOSED'
  | 'WASHINGTON_GROUP_FLAG_DISAGREES'
  | 'COLUMN_MOVED_OFF_CALCULATED'

/** Field codes and counts only; no source value ever enters the summary. */
export interface DraftSummary {
  addedFields: string[]
  sourceNamesAdded: string[]
  optionsAdded: string[]
  aliasesAdded: number
  defaults: string[]
  rules: string[]
  needsCheck: Array<{ fieldCode: string; reason: NeedsCheckReason }>
}

export class FormDraftError extends Error {
  code: 'FIELD_LIMIT' | 'NOTHING_TO_ADD'

  constructor(code: 'FIELD_LIMIT' | 'NOTHING_TO_ADD') {
    super(
      code === 'FIELD_LIMIT'
        ? 'The draft would exceed the 100 field limit.'
        : 'Every column is already covered by the form.',
    )
    this.name = 'FormDraftError'
    this.code = code
  }
}

const LIMITS = { fields: 100, options: 100, aliases: 100, sourceNames: 20, nameLength: 100 }
const LABEL_LENGTH = 160
const OPTION_LENGTH = 120
const TEXT_LENGTH = 255
// Fields whose options mirror a database enum, so a draft never adds to them.
const ENUM_MIRROR_CODES = new Set([
  'sex',
  'disability_status',
  'subject_type',
  'registration_operation',
])
const REGISTRATION_DEFAULTS = [
  ['registration_operation', 'CREATE'],
  ['subject_type', 'INDIVIDUAL'],
] as const
const CONSENT_WORDS = ['data', 'collection', 'use', 'processing']
const IDENTIFIER_WORDS = ['id', 'certificate', 'cert']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

const headerTokens = (header: string) =>
  normalizeMappingNameV1(header)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

function inferType(
  values: readonly unknown[],
): 'DATE' | 'BOOLEAN' | 'INTEGER' | 'DECIMAL' | 'TEXT' {
  const all = (test: (value: unknown) => boolean) => values.every(test)
  if (
    all(
      (v) =>
        typeof v === 'string' && ISO_DATE.test(v.trim()) && !Number.isNaN(Date.parse(v.trim())),
    )
  )
    return 'DATE'
  if (all((v) => typeof v === 'boolean')) return 'BOOLEAN'
  if (all((v) => typeof v === 'number' && Number.isSafeInteger(v))) return 'INTEGER'
  if (all((v) => typeof v === 'number' && Number.isFinite(v))) return 'DECIMAL'
  return 'TEXT'
}

/** The case-folded "A" or "10" label of a lettered answer, if it has one. */
const labelOf = (text: string) => /^([a-z]|\d{1,2})[.)]\s/i.exec(text)?.[1].toLowerCase()

/** Sort key of the label: numbers first, then letters, then unlabelled text. */
function prefixRank(text: string) {
  const label = labelOf(text)
  if (label === undefined) return '2'
  return /^\d/.test(label) ? `0${label.padStart(2, '0')}` : `1${label}`
}

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

/** Letter order, then answer text, so a draft does not depend on row order. */
const byPrefix = (left: string, right: string) =>
  compareText(prefixRank(left), prefixRank(right)) ||
  compareText(
    comparableAnswer(stripLetterPrefix(left)),
    comparableAnswer(stripLetterPrefix(right)),
  ) ||
  compareText(left, right)

/**
 * True for a lettered choice list: at least 90 percent lettered, each label meaning one answer,
 * and repeated answers. This keeps lettered personal data ("J. Cruz", "1. Juan") out of options.
 */
function isChoiceColumn(texts: readonly string[]) {
  if (texts.filter(hasLetterPrefix).length * 100 < texts.length * 90) return false
  const answers = new Set<string>()
  const byLabel = new Map<string, Set<string>>()
  for (const text of texts) {
    const answer = comparableAnswer(stripLetterPrefix(text))
    answers.add(answer)
    const label = labelOf(text)
    if (label !== undefined) byLabel.set(label, (byLabel.get(label) ?? new Set()).add(answer))
  }
  return answers.size * 2 <= texts.length && [...byLabel.values()].every((set) => set.size === 1)
}

/** Options in letter order with each original answer as an alias, or null when the column is not a choice list or too wide for a form. */
function choicesOf(texts: readonly string[]) {
  if (!isChoiceColumn(texts)) return null
  const originals = [...new Set(texts)].sort(byPrefix)
  if (originals.some((text) => text.length > LIMITS.nameLength)) return null
  const options: string[] = []
  for (const text of originals) {
    const option = stripLetterPrefix(text)
    if (!options.some((existing) => comparableAnswer(existing) === comparableAnswer(option)))
      options.push(option)
  }
  if (options.length > LIMITS.options) return null
  const aliases: ImportValueMapEntry[] = []
  const seen = new Set<string>()
  for (const text of originals) {
    const to = options.find(
      (option) => comparableAnswer(option) === comparableAnswer(stripLetterPrefix(text)),
    )
    if (!to || seen.has(mapKey(text))) continue
    seen.add(mapKey(text))
    if (valueMapText(1).safeParse(text).success && valueMapText(1).safeParse(to).success)
      aliases.push({ from: text, to })
  }
  return { options, aliases: aliases.slice(0, LIMITS.aliases) }
}

/** Builds the new field for an unmatched column (rule 3). */
function newField(
  header: string,
  present: readonly unknown[],
  taken: Set<string>,
): FormFieldRequest {
  const base = {
    code: fieldCodeFromHeader(header, taken),
    label: header.slice(0, LABEL_LENGTH),
    required: false,
    metadataKey: false,
    sadddField: false,
    ...(header.length <= LIMITS.nameLength ? { sourceNames: [header] } : {}),
  }
  const type = inferType(present)
  if (type !== 'TEXT') return { ...base, dataType: type }
  const texts = present.map((value) => String(value).trim())
  const choices = choicesOf(texts)
  if (choices)
    return {
      ...base,
      dataType: 'SELECT',
      allowedValues: choices.options,
      valueAliases: choices.aliases,
    }
  return {
    ...base,
    dataType: texts.some((text) => text.length > TEXT_LENGTH) ? 'LONG_TEXT' : 'TEXT',
  }
}

/** The import default for an identifier type: the header upper-cased as a code of at most 32 characters. */
const identifierTypeDefault = (header: string) =>
  header
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .slice(0, 32)
    .replace(/^_+|_+$/g, '')

/**
 * Drafts what a staged import needs from a form (spec 3.6 rules 1-7): source names,
 * new fields, answer aliases and options, and defaults. Pure and deterministic; the result is
 * a proposal for a publisher to check, and the summary carries field codes and counts only.
 */
export function draftFormFromImport(input: {
  formType: DigitalFormType
  fields: readonly DraftField[]
  columns: readonly DraftColumn[]
  decisions: readonly SmartMatchDecision[]
  uploadDate: string
}): { fields: FormFieldRequest[]; summary: DraftSummary } {
  const fields = structuredClone([...input.fields])
  const byId = new Map(fields.flatMap((field) => (field.id ? [[field.id, field] as const] : [])))
  const byCode = new Map(fields.map((field) => [field.code, field]))
  const columnByKey = new Map(input.columns.map((column) => [column.key, column]))
  const taken = new Set(fields.map((field) => field.code))
  // Codes of fields that already have a column, by decision or by a proposal in this run.
  const used = new Set(
    input.decisions.flatMap((decision) => {
      const field = decision.status === 'MAPPED' && byId.get(decision.targetFieldId ?? '')
      return field ? [field.code] : []
    }),
  )
  const summary: DraftSummary = {
    addedFields: [],
    sourceNamesAdded: [],
    optionsAdded: [],
    aliasesAdded: 0,
    defaults: [],
    rules: [],
    needsCheck: [],
  }
  const added: DraftField[] = []
  // Source key to the field code its column feeds, for the rule detection.
  const mapping = new Map<string, string>()
  const note = (list: string[], code: string) => {
    if (!list.includes(code)) list.push(code)
  }
  const flag = (fieldCode: string, reason: NeedsCheckReason) => {
    if (!summary.needsCheck.some((item) => item.fieldCode === fieldCode && item.reason === reason))
      summary.needsCheck.push({ fieldCode, reason })
  }
  const free = (code: string) => (used.has(code) ? undefined : byCode.get(code))

  function addSourceName(field: DraftField, header: string, reason: NeedsCheckReason) {
    const names = field.sourceNames ?? []
    if (header.length > LIMITS.nameLength || names.length >= LIMITS.sourceNames) return false
    if (!names.some((name) => mapKey(name) === mapKey(header))) {
      field.sourceNames = [...names, header]
      note(summary.sourceNamesAdded, field.code)
    }
    flag(field.code, reason)
    used.add(field.code)
    return true
  }

  // Rule 2 and 5: the existing field a pending column belongs to, and why.
  function proposal(
    decision: SmartMatchDecision,
    type: string,
    tokens: string[],
  ): [DraftField, NeedsCheckReason] | undefined {
    if (
      type === 'BOOLEAN' &&
      tokens.includes('consent') &&
      CONSENT_WORDS.some((w) => tokens.includes(w))
    ) {
      const consent = free('data_processing_consent_recorded')
      if (consent) return [consent, 'CONSENT_SOURCE_PROPOSED']
    }
    const suggested = decision.suggestedFieldId
      ? byId.get(decision.suggestedFieldId)
      : fields.find(
          (field) =>
            !used.has(field.code) &&
            (SMART_REVIEW_SYNONYMS_V2[field.code] ?? []).some((name) =>
              headerTokens(name).every((token) => tokens.includes(token)),
            ),
        )
    if (suggested) return [suggested, 'SUGGESTED_SOURCE_NAME']
    const identifier = free('external_identifier_value')
    if (
      type === 'TEXT' &&
      identifier &&
      byCode.has('external_identifier_type') &&
      IDENTIFIER_WORDS.some((word) => tokens.includes(word))
    )
      return [identifier, 'IDENTIFIER_PROPOSED']
  }

  // Rule 4: aliases for answers a SELECT field cannot resolve, else options, else a flag.
  function reconcileAnswers(field: DraftField, present: readonly unknown[]) {
    if (field.dataType !== 'SELECT') return
    const texts = present
      .filter((value) => typeof value === 'string' || typeof value === 'boolean')
      .map((value) => String(value).trim())
    const allowed = field.allowedValues ?? []
    const aliases = field.valueAliases ?? []
    const resolve = answerResolver(allowed, aliases)
    const unresolved = [...new Set(texts)].filter((text) => resolve(text) === null).sort(byPrefix)
    if (unresolved.length === 0) return
    const accepted = suggestValueMap(unresolved, allowed, aliases).pairs.slice(
      0,
      LIMITS.aliases - aliases.length,
    )
    if (accepted.length) {
      field.valueAliases = [...aliases, ...accepted]
      summary.aliasesAdded += accepted.length
    }
    const options = [...allowed]
    const lettered = isChoiceColumn(texts)
    for (const text of unresolved.filter((t) => !accepted.some((pair) => pair.from === t))) {
      const option = stripLetterPrefix(text)
      if (
        ENUM_MIRROR_CODES.has(field.code) ||
        !lettered ||
        option.length > OPTION_LENGTH ||
        options.length >= LIMITS.options
      )
        flag(field.code, 'ENUM_ANSWER_UNRESOLVED')
      else if (!options.some((existing) => comparableAnswer(existing) === comparableAnswer(option)))
        options.push(option)
    }
    if (options.length > allowed.length) {
      field.allowedValues = options
      note(summary.optionsAdded, field.code)
    }
  }

  let consentProposed = false
  const ordered = [...input.decisions].sort((left, right) => left.columnIndex - right.columnIndex)
  for (const decision of ordered) {
    const column = columnByKey.get(decision.sourceKey)
    const header = column?.header.trim() ?? ''
    const present = column?.values.filter((value) => !isBlank(value)) ?? []
    if (!column || decision.status === 'IGNORED' || !header || present.length === 0) continue
    let target = decision.status === 'MAPPED' ? byId.get(decision.targetFieldId ?? '') : undefined
    if (decision.status === 'PENDING') {
      const found = proposal(decision, inferType(present), headerTokens(header))
      if (!found) {
        const field = newField(header, present, taken)
        added.push(field)
        note(summary.addedFields, field.code)
        mapping.set(column.key, field.code)
        continue
      }
      if (!addSourceName(found[0], header, found[1])) continue
      target = found[0]
      if (found[1] === 'CONSENT_SOURCE_PROPOSED') consentProposed = true
      const identifierType = byCode.get('external_identifier_type')
      if (
        found[1] === 'IDENTIFIER_PROPOSED' &&
        identifierType &&
        !used.has(identifierType.code) &&
        identifierType.importDefault == null
      ) {
        identifierType.importDefault = identifierTypeDefault(header)
        note(summary.defaults, identifierType.code)
        flag(identifierType.code, 'IMPORT_DEFAULT')
      }
    }
    if (target) {
      mapping.set(column.key, target.code)
      reconcileAnswers(target, present)
    }
  }

  if (consentProposed && free('consent_recorded'))
    flag('consent_recorded', 'PARTICIPATION_CONSENT_NO_SOURCE')

  if (input.formType === 'BENEFICIARY_REGISTRATION') {
    for (const [code, value] of REGISTRATION_DEFAULTS) {
      const field = free(code)
      if (field?.required && field.importDefault == null && field.allowedValues?.includes(value)) {
        field.importDefault = value
        note(summary.defaults, code)
        flag(code, 'IMPORT_DEFAULT')
      }
    }
  }

  const drafted: DraftField[] = [...fields, ...added]
  proposeIntakeRules(drafted, input.columns, mapping, input.uploadDate, summary)

  const changed =
    added.length +
    summary.sourceNamesAdded.length +
    summary.optionsAdded.length +
    summary.aliasesAdded +
    summary.defaults.length +
    summary.needsCheck.length
  if (changed === 0) throw new FormDraftError('NOTHING_TO_ADD')
  if (drafted.length > LIMITS.fields) throw new FormDraftError('FIELD_LIMIT')
  return { fields: drafted.map(({ id, ...field }) => field), summary }
}
