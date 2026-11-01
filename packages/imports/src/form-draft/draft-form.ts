import {
  CONSENT_FIELD_CODES,
  type DigitalFormType,
  type FormFieldRequest,
  valueMapText,
} from '@pathways/shared'
import { answerResolver, comparableAnswer, hasLetterPrefix, stripLetterPrefix } from '../answers'
import {
  SMART_REVIEW_SYNONYMS_V2,
  type SmartMatchDecision,
  normalizeMappingNameV1,
} from '../mappers/smart-match'
import { STOP_WORDS } from '../mappers/smart-match-rules'
import { boundedSamples, valueGate } from '../mappers/smart-match-values'
import { type ImportValueMapEntry, mapKey } from '../value-map'
import { suggestValueMap } from '../value-map-suggest'
import { proposeIntakeRules, sourceNameFree, storableInteger } from './draft-rules'
import { fieldCodeFromHeader } from './field-code'

export type DraftField = FormFieldRequest & { id?: string }

export interface DraftColumn {
  key: string
  columnIndex: number
  header: string
  /** The stable row-1 code above the label, when the file has one. */
  sourceCode?: string
  /** Every staged value of the column, blanks included. */
  values: readonly unknown[]
}

export type NeedsCheckReason =
  | 'ENUM_ANSWER_UNRESOLVED'
  | 'PARTICIPATION_CONSENT_NO_SOURCE'
  | 'CONSENT_SOURCE_PROPOSED'
  | 'WASHINGTON_GROUP_FLAG_DISAGREES'

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
const CONSENT_WORDS = ['collection', 'use', 'processing']
// Words a data consent header may hold; any other word, such as "Parents" or "Non", can change whose consent it is or whether it is one.
const DATA_CONSENT_HEADER_WORDS = new Set([
  ...STOP_WORDS,
  ...CONSENT_WORDS,
  'consent',
  'data',
  'personal',
  'privacy',
  'information',
  'purpose',
  'purposes',
  'do',
  'i',
  'you',
  'your',
  'my',
])
// A tag after a dash can be a program name, so tags naming someone else or a refusal are refused by name.
const REFUSED_TAGS = new Set([
  'parent',
  'parents',
  'guardian',
  'guardians',
  'mother',
  'father',
  'spouse',
  'caregiver',
  'staff',
  'enumerator',
  'no',
  'not',
  'none',
  'withdrawn',
  'revoked',
  'declined',
  'refused',
  'denied',
  'rejected',
  'hindi',
  'ayaw',
  'magulang',
  'nanay',
  'tatay',
])
// Parts of header words that may mark a person's own answer about taking part, in English and Filipino; "participat" leaves out "participant".
const OWN_ANSWER_STEMS = [
  'consent',
  'assent',
  'agree',
  'participat',
  'permission',
  'willing',
  'refus',
  'declin',
  'opted',
  'pahintulot',
  'payag',
  'sang',
  'sumali',
  'lumahok',
]
// Consent fields a column may feed without being the person's own answer about taking part.
const OTHER_CONSENT_CODES = ['data_processing_consent_recorded', 'guardian_consent_recorded']
const IDENTIFIER_WORDS = ['id', 'certificate', 'cert']
// Words naming the registered person; any other word, such as "Guardian" or "Staff", may name someone else.
const SUBJECT_WORDS = new Set([...STOP_WORDS, 'student', 'learner', 'trainee', 'client', 'youth'])
const IDENTIFIER_HEADER_WORDS = new Set([
  ...SUBJECT_WORDS,
  ...IDENTIFIER_WORDS,
  'no',
  'number',
  'num',
  'barangay',
  'birth',
  'national',
])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

const headerTokens = (header: string) =>
  normalizeMappingNameV1(header)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/**
 * True when a header holds this name and otherwise only words for the registered person, ignoring a short program tag such as the " - YEE" of "Gender - YEE".
 * shortcut: a role of four capitals or fewer ("Gender - WIFE") reads as a tag; upgrade to a list of tags if a file shows one.
 */
const namesField = (header: string, name: string) => {
  const own = headerTokens(header.replace(/\s[-–—]\s*[A-Z0-9]{2,4}$/, '')).filter(
    (token) => !SUBJECT_WORDS.has(token),
  )
  const wanted = headerTokens(name)
  return own.length === wanted.length && wanted.every((token) => own.includes(token))
}

/**
 * True when a header can only mean the registered person's consent to data use, ignoring a one-word tag such as " - Futuremaker".
 * shortcut: a plain-word tag outside REFUSED_TAGS still passes, and the item stays listed for a person; upgrade if a file shows one.
 */
function namesDataConsent(header: string) {
  const tag = /\s[-–—]\s*([A-Za-z0-9]+)$/.exec(header)
  if (tag && REFUSED_TAGS.has(tag[1].toLowerCase())) return false
  const tokens = headerTokens(tag ? header.slice(0, tag.index) : header)
  return (
    tokens.includes('consent') &&
    tokens.includes('data') &&
    CONSENT_WORDS.some((word) => tokens.includes(word)) &&
    tokens.every((token) => DATA_CONSENT_HEADER_WORDS.has(token))
  )
}

/**
 * True when a header can only mean the registered person's ID and at least 90 percent of the values differ, so one duplicate is held by row and a shared ID is refused.
 * shortcut: one or two rows always pass the 90 percent test and "Barangay ID" could be a location code; upgrade if a small file or a form shows one.
 */
function isIdentifierColumn(tokens: readonly string[], present: readonly unknown[]) {
  if (!IDENTIFIER_WORDS.some((word) => tokens.includes(word))) return false
  if (!tokens.every((token) => IDENTIFIER_HEADER_WORDS.has(token))) return false
  const distinct = new Set(present.map((value) => String(value).trim().toLowerCase()))
  return distinct.size * 100 >= present.length * 90
}

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
  if (all(storableInteger)) return 'INTEGER'
  // A decimal column has at least one fraction; whole numbers too long for INTEGER stay text.
  if (
    all((v) => typeof v === 'number' && Number.isFinite(v)) &&
    values.some((v) => !Number.isInteger(v))
  )
    return 'DECIMAL'
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

/** True when at least two labels of one kind run in order with at most one missing; a list may start past A, scattered initials do not run. */
function labelsRunInOrder(labels: readonly string[]) {
  const numbered = labels.filter((label) => /^\d/.test(label)).length
  if (labels.length < 2 || (numbered > 0 && numbered < labels.length)) return false
  const ranks = labels.map((label) => (numbered ? Number(label) : label.charCodeAt(0)))
  return Math.max(...ranks) - Math.min(...ranks) + 1 - labels.length <= 1
}

/**
 * True for a lettered choice list: at least 90 percent lettered, each label meaning one answer,
 * labels in order, and repeated answers. This keeps most lettered personal data ("J. Cruz", "1. Juan") out of options.
 * shortcut: names whose initials happen to run in order ("L. Cruz", "M. Santos") still pass and a one-answer list stays text; upgrade if a form ever shows one.
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
  return (
    answers.size * 2 <= texts.length &&
    [...byLabel.values()].every((set) => set.size === 1) &&
    labelsRunInOrder([...byLabel.keys()])
  )
}

/** Options in letter order with each lettered answer as an alias, leaving out unlettered answers that could be names, or null when the column is not a choice list or too wide for a form. */
function choicesOf(texts: readonly string[]) {
  if (!isChoiceColumn(texts)) return null
  const originals = [...new Set(texts.filter(hasLetterPrefix))].sort(byPrefix)
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
  allowChoices: boolean,
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
  const choices = allowChoices ? choicesOf(texts) : null
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
 * new fields, answer aliases and options, and defaults. Pure and deterministic; matches are
 * accepted as drafted, needsCheck holds only what no rule can settle, and the summary carries
 * field codes and counts only.
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
  // A new field never takes a consent code, because the consent checks read those codes.
  const taken = new Set([...fields.map((field) => field.code), ...CONSENT_FIELD_CODES])
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

  function addSourceName(field: DraftField, header: string) {
    const names = field.sourceNames ?? []
    if (header.length > LIMITS.nameLength || names.length >= LIMITS.sourceNames) return false
    if (!sourceNameFree([...fields, ...added], header, field)) return false
    if (!names.some((name) => mapKey(name) === mapKey(header))) {
      field.sourceNames = [...names, header]
      note(summary.sourceNamesAdded, field.code)
    }
    used.add(field.code)
    return true
  }

  // No person confirms a match, so a taken field, a consent field by name or values of the wrong type are refused.
  function acceptsColumn(field: DraftField, present: readonly unknown[]) {
    if (used.has(field.code) || (CONSENT_FIELD_CODES as readonly string[]).includes(field.code))
      return false
    if (field.dataType === 'SELECT') return true
    const allowed = field.allowedValues ?? []
    return (
      valueGate(boundedSamples(present), {
        field: { ...field, id: field.id ?? field.code },
        allowed: new Set(allowed.map(normalizeMappingNameV1)),
        resolve: answerResolver(allowed, field.valueAliases ?? []),
      }) === 'PASS'
    )
  }

  // Rule 2 and 5: the existing field a pending column belongs to, and how it was recognised.
  function proposal(
    decision: SmartMatchDecision,
    present: readonly unknown[],
    header: string,
  ): [DraftField, 'CONSENT' | 'SUGGESTED' | 'IDENTIFIER'] | undefined {
    const type = inferType(present)
    const tokens = headerTokens(header)
    if (type === 'BOOLEAN' && namesDataConsent(header)) {
      const consent = free('data_processing_consent_recorded')
      if (consent) return [consent, 'CONSENT']
    }
    // Two columns or two fields scored alike, so the name alone cannot pick one.
    if (decision.reason === 'HELD_CONTESTED' || decision.reason === 'HELD_MARGIN') return undefined
    const suggested = decision.suggestedFieldId
      ? byId.get(decision.suggestedFieldId)
      : fields.find(
          (field) =>
            !used.has(field.code) &&
            Object.hasOwn(SMART_REVIEW_SYNONYMS_V2, field.code) &&
            [field.code, ...SMART_REVIEW_SYNONYMS_V2[field.code]].some((name) =>
              namesField(header, name),
            ),
        )
    if (suggested) return acceptsColumn(suggested, present) ? [suggested, 'SUGGESTED'] : undefined
    const identifier = free('external_identifier_value')
    if (
      type === 'TEXT' &&
      identifier &&
      byCode.has('external_identifier_type') &&
      isIdentifierColumn(tokens, present)
    )
      return [identifier, 'IDENTIFIER']
  }

  // Rule 4: aliases for answers a SELECT field cannot resolve, else options, else a flag.
  function reconcileAnswers(field: DraftField, present: readonly unknown[]) {
    if (field.dataType !== 'SELECT') return
    const texts = present
      .filter((value) => ['string', 'boolean', 'number'].includes(typeof value))
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
        !hasLetterPrefix(text) ||
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
      const found = proposal(decision, present, header)
      if (!found || !addSourceName(found[0], header)) {
        // A column that lost its match stays text, so lettered names in it cannot become options.
        const lostMatch =
          found !== undefined ||
          decision.suggestedFieldId !== null ||
          decision.reason.startsWith('HELD_')
        const field = newField(header, present, taken, !lostMatch)
        // shortcut: a repeated or punctuation-only header keeps only its label, so a redraft adds it again; upgrade when people re-upload such files.
        if (!sourceNameFree([...fields, ...added], header)) field.sourceNames = undefined
        if (
          field.dataType === 'SELECT' &&
          present.some((value) => !hasLetterPrefix(String(value).trim()))
        )
          flag(field.code, 'ENUM_ANSWER_UNRESOLVED')
        added.push(field)
        note(summary.addedFields, field.code)
        mapping.set(column.key, field.code)
        continue
      }
      target = found[0]
      if (found[1] === 'CONSENT') {
        consentProposed = true
        // A header cannot prove who agreed to what, and a wrong match records consent nobody gave.
        flag(found[0].code, 'CONSENT_SOURCE_PROPOSED')
      }
      const identifierType = byCode.get('external_identifier_type')
      if (
        found[1] === 'IDENTIFIER' &&
        identifierType &&
        !used.has(identifierType.code) &&
        identifierType.importDefault == null
      ) {
        identifierType.importDefault = identifierTypeDefault(header)
        note(summary.defaults, identifierType.code)
      }
    }
    if (target) {
      mapping.set(column.key, target.code)
      reconcileAnswers(target, present)
    }
  }

  // A column's stable code joins its field's source names unless another field already lists it.
  const everyField = [...fields, ...added]
  for (const column of input.columns) {
    const target = everyField.find((field) => field.code === mapping.get(column.key))
    if (target && column.sourceCode) addSourceName(target, column.sourceCode)
  }

  if (input.formType === 'BENEFICIARY_REGISTRATION') {
    for (const [code, value] of REGISTRATION_DEFAULTS) {
      const field = free(code)
      if (field?.required && field.importDefault == null && field.allowedValues?.includes(value)) {
        field.importDefault = value
        note(summary.defaults, code)
      }
    }
    // A yes to data use also stands for taking part (developer's decision, 2026-11-01), unless another column may hold the person's own answer.
    const participation = free('consent_recorded')
    const copies = participation?.rule?.kind === 'SAME_ANSWER_AS'
    if (participation && (copies || (consentProposed && !participation.rule))) {
      const ownAnswer = input.columns.some((column) => {
        const target = mapping.get(column.key) ?? ''
        // A form that already copies has settled the fields it holds, so only a field new in this draft counts.
        const settled = copies
          ? !summary.addedFields.includes(target)
          : OTHER_CONSENT_CODES.includes(target)
        return (
          !settled &&
          headerTokens(column.header).some((token) =>
            OWN_ANSWER_STEMS.some((stem) => token.includes(stem)),
          )
        )
      })
      if (ownAnswer) {
        participation.rule = undefined
        flag(participation.code, 'PARTICIPATION_CONSENT_NO_SOURCE')
      } else if (!copies) {
        participation.rule = { kind: 'SAME_ANSWER_AS', field: 'data_processing_consent_recorded' }
        note(summary.rules, participation.code)
      }
    }
  }

  const drafted: DraftField[] = [...fields, ...added]
  proposeIntakeRules(drafted, input.columns, mapping, input.uploadDate, summary)
  // A rule can move a column off again, so report only the fields that really gained a name.
  summary.sourceNamesAdded = summary.sourceNamesAdded.filter((code) => {
    const names = drafted.find((field) => field.code === code)?.sourceNames ?? []
    const before = input.fields.find((field) => field.code === code)?.sourceNames ?? []
    return names.some((name) => !before.includes(name))
  })

  const changed =
    added.length +
    summary.sourceNamesAdded.length +
    summary.optionsAdded.length +
    summary.aliasesAdded +
    summary.defaults.length +
    summary.rules.length +
    summary.needsCheck.length
  if (changed === 0) throw new FormDraftError('NOTHING_TO_ADD')
  if (drafted.length > LIMITS.fields) throw new FormDraftError('FIELD_LIMIT')
  return { fields: drafted.map(({ id, ...field }) => field), summary }
}
