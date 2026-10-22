import { type FieldIntakeRule, completedYearsAt, valueMapText } from '@pathways/shared'
import { comparableAnswer, hasLetterPrefix, stripLetterPrefix } from '../answers'
import { WASHINGTON_GROUP_LEVELS_V1, washingtonGroupLevel } from '../intake-rules'
import { type ImportValueMapEntry, mapKey } from '../value-map'
import type { DraftColumn, DraftField, DraftSummary, NeedsCheckReason } from './draft-form'
import { fieldCodeFromHeader } from './field-code'

const OTHER_ANSWERS = new Set(['iba pa', 'other', 'others', 'iba'])
const YES = new Set(['true', 'yes', 'oo', '1'])
const NO = new Set(['false', 'no', 'hindi', '0'])
const MAX_SOURCE_NAMES = 20
const MAX_ALIASES = 100
const MAX_NAME_LENGTH = 100

const isBlank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
const bare = (value: unknown) => comparableAnswer(stripLetterPrefix(String(value)))
const flagOf = (value: unknown) => {
  const key = comparableAnswer(String(value))
  return YES.has(key) ? true : NO.has(key) ? false : undefined
}

function toDay(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null
  const day = new Date(`${value.trim()}T00:00:00.000Z`)
  return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value.trim() ? null : day
}

/**
 * Proposes calculations and cross-checks (spec 3.6 rule 6) on the drafted fields, only where
 * they hold on every row that has their inputs. `mapping` is source key to field code; it is
 * updated when a column moves. Mutates `fields` and `summary`; the publisher reviews each rule.
 */
export function proposeIntakeRules(
  fields: DraftField[],
  columns: readonly DraftColumn[],
  mapping: Map<string, string>,
  uploadDate: string,
  summary: DraftSummary,
): void {
  const byCode = new Map(fields.map((field) => [field.code, field]))
  const ordered = [...columns].sort((left, right) => left.columnIndex - right.columnIndex)
  const rows = Math.max(0, ...columns.map((column) => column.values.length))
  const rowIndexes = Array.from({ length: rows }, (_, row) => row)
  const upload = toDay(uploadDate)

  const columnFor = (code: string) => ordered.find((column) => mapping.get(column.key) === code)
  const isNew = (code: string) => summary.addedFields.includes(code)
  const flag = (fieldCode: string, reason: NeedsCheckReason) => {
    if (!summary.needsCheck.some((item) => item.fieldCode === fieldCode && item.reason === reason))
      summary.needsCheck.push({ fieldCode, reason })
  }
  // A field that exists and has no rule yet; a calculated rule also needs it to have no import default.
  const open = (code: string, calculated = false) => {
    const field = byCode.get(code)
    return field && !field.rule && !(calculated && field.importDefault != null) ? field : undefined
  }
  const propose = (field: DraftField, rule: FieldIntakeRule) => {
    field.rule = rule
    if (!summary.rules.includes(field.code)) summary.rules.push(field.code)
    flag(field.code, 'RULE_PROPOSED')
  }
  const addSourceName = (field: DraftField, header: string) => {
    const names = field.sourceNames ?? []
    if (names.some((name) => mapKey(name) === mapKey(header))) return
    if (header.length > MAX_NAME_LENGTH || names.length >= MAX_SOURCE_NAMES) return
    field.sourceNames = [...names, header]
    if (!summary.sourceNamesAdded.includes(field.code)) summary.sourceNamesAdded.push(field.code)
  }
  const dropNew = (field: DraftField) => {
    fields.splice(fields.indexOf(field), 1)
    summary.addedFields = summary.addedFields.filter((code) => code !== field.code)
    summary.needsCheck = summary.needsCheck.filter((item) => item.fieldCode !== field.code)
  }

  function washingtonGroup() {
    const status = open('disability_status', true)
    if (!status) return
    const questions = ordered.flatMap((column) => {
      const field = byCode.get(mapping.get(column.key) ?? '')
      const present = column.values.filter((value) => !isBlank(value))
      const texts = present.map((value) => String(value).trim())
      const valid =
        field?.dataType === 'SELECT' &&
        !field.rule &&
        present.length > 0 &&
        present.every((value) => typeof value === 'string') &&
        texts.every((text) => hasLetterPrefix(text) && washingtonGroupLevel(text) !== null) &&
        (field.allowedValues ?? []).every((option) => washingtonGroupLevel(option) !== null)
      return valid ? [{ column, field, texts }] : []
    })
    if (questions.length !== 6 || new Set(questions.map((q) => q.field.code)).size !== 6) return

    // Four options in level order: an existing one, else the file's own text, else the standard text.
    const plans = questions.map(({ field, texts }) => {
      const originals = [...new Set(texts)].sort()
      const options = WASHINGTON_GROUP_LEVELS_V1.map(
        (standard, index) =>
          (field.allowedValues ?? []).find((o) => washingtonGroupLevel(o) === index + 1) ??
          originals.map(stripLetterPrefix).find((t) => washingtonGroupLevel(t) === index + 1) ??
          standard[0],
      )
      const optionOf = (text: string) => options[(washingtonGroupLevel(text) ?? 1) - 1]
      const aliases: ImportValueMapEntry[] = []
      const seen = new Set<string>()
      const pairs = [
        ...(field.valueAliases ?? []).filter((alias) => washingtonGroupLevel(alias.to) !== null),
        ...originals.map((text) => ({ from: text, to: text })),
      ]
      for (const { from, to } of pairs) {
        const target = optionOf(to)
        if (from === target || seen.has(mapKey(from))) continue
        if (!valueMapText(1).safeParse(from).success || !valueMapText(1).safeParse(target).success)
          continue
        seen.add(mapKey(from))
        aliases.push({ from, to: target })
      }
      return { field, options, aliases: aliases.slice(0, MAX_ALIASES) }
    })
    const disabilityValues: string[] = []
    for (const { options } of plans)
      for (const option of options.slice(2))
        if (!disabilityValues.some((v) => comparableAnswer(v) === comparableAnswer(option)))
          disabilityValues.push(option)
    if (disabilityValues.length > 8) return

    for (const { field, options, aliases } of plans) {
      const before = { options: field.allowedValues ?? [], aliases: field.valueAliases ?? [] }
      field.allowedValues = options
      field.valueAliases = aliases
      if (isNew(field.code)) continue
      if (options.join('\n') !== before.options.join('\n'))
        if (!summary.optionsAdded.includes(field.code)) summary.optionsAdded.push(field.code)
      summary.aliasesAdded += Math.max(0, aliases.length - before.aliases.length)
    }

    // The flag column: the first yes/no column that agrees with the cut-off, else a disability-named one that does not.
    const levels = (row: number) =>
      questions.map(({ column }) =>
        isBlank(column.values[row]) ? null : washingtonGroupLevel(String(column.values[row])),
      )
    const asked = new Set(questions.map(({ column }) => column.key))
    const allowed = status.allowedValues ?? []
    const flagCanAlias =
      allowed.includes('WITH_DISABILITY') && allowed.includes('WITHOUT_DISABILITY')
    let agreeing: { field: DraftField; column: DraftColumn } | undefined
    let disagreeing: DraftField | undefined
    for (const column of ordered) {
      const field = byCode.get(mapping.get(column.key) ?? '')
      const present = column.values.filter((value) => !isBlank(value))
      if (asked.has(column.key) || !field || !isNew(field.code) || present.length === 0) continue
      if (!present.every((value) => flagOf(value) !== undefined)) continue
      let checked = 0
      let differs = 0
      for (const row of rowIndexes) {
        if (isBlank(column.values[row])) continue
        const answers = levels(row)
        if (answers.every((level) => level === null)) continue
        const expected = answers.some((level) => level !== null && level >= 3)
          ? true
          : answers.every((level) => level !== null)
            ? false
            : undefined
        checked++
        if (expected !== flagOf(column.values[row])) differs++
      }
      const named = /disab|\bpwd\b/i.test(column.header)
      const both = new Set(present.map(flagOf)).size === 2
      if (checked === 0) continue
      if (differs === 0 && (named || both)) {
        agreeing ??= { field, column }
      } else if (differs > 0 && named) disagreeing ??= field
    }
    if (agreeing && flagCanAlias) {
      const { field, column } = agreeing
      addSourceName(status, column.header.trim())
      const aliases = status.valueAliases ?? []
      const texts = column.values.filter((v) => !isBlank(v)).map((v) => String(v).trim())
      for (const text of [...new Set(texts)].sort()) {
        if (aliases.length >= MAX_ALIASES || aliases.some((a) => mapKey(a.from) === mapKey(text)))
          continue
        aliases.push({ from: text, to: flagOf(text) ? 'WITH_DISABILITY' : 'WITHOUT_DISABILITY' })
        summary.aliasesAdded++
      }
      status.valueAliases = aliases
      mapping.set(column.key, status.code)
      dropNew(field)
    } else if (disagreeing) flag(disagreeing.code, 'WASHINGTON_GROUP_FLAG_DISAGREES')

    propose(status, {
      kind: 'WASHINGTON_GROUP_DISABILITY',
      questionFields: questions.map(({ field }) => field.code),
      disabilityValues,
    })
  }

  function ages() {
    const birth = columnFor('birth_date')
    const enrolled = columnFor('enrollment_date')
    if (!birth || !enrolled) return
    const years = (row: number, at: Date | null = toDay(enrolled.values[row])) => {
      const born = toDay(birth.values[row])
      return born && at ? completedYearsAt(born, at) : null
    }
    for (const [code, kind] of [
      ['age_at_registration', 'AGE_AT_DATE'],
      ['is_minor', 'MINOR_AT_DATE'],
    ] as const) {
      const field = open(code, true)
      if (!field) continue
      const column = columnFor(code)
      const expected = (row: number) => {
        const age = years(row)
        return age === null ? null : kind === 'AGE_AT_DATE' ? age : age < 18
      }
      const agrees =
        !column ||
        rowIndexes.every(
          (row) =>
            isBlank(column.values[row]) ||
            expected(row) === null ||
            column.values[row] === expected(row),
        )
      propose(field, { kind, birthField: 'birth_date', atField: 'enrollment_date' })
      if (!column) continue
      const header = column.header.trim()
      if (agrees) {
        addSourceName(field, header)
        continue
      }
      moveOff(field, column, header, kind === 'AGE_AT_DATE')
    }

    // An unruled integer column that equals age at the enrollment date or the upload date.
    for (const field of fields) {
      const column = columnFor(field.code)
      if (!column || field.rule || field.dataType !== 'INTEGER' || !isNew(field.code)) continue
      const rowsChecked = rowIndexes.filter(
        (row) => !isBlank(column.values[row]) && years(row, upload) !== null,
      )
      if (
        rowsChecked.length > 0 &&
        rowsChecked.every(
          (row) => column.values[row] === years(row, upload) || column.values[row] === years(row),
        )
      )
        propose(field, {
          kind: 'AGE_CHECK',
          birthField: 'birth_date',
          atFields: ['enrollment_date'],
        })
    }
  }

  // Moves a column that disagrees with the calculation onto a new field of its own.
  function moveOff(field: DraftField, column: DraftColumn, header: string, isAge: boolean) {
    const names = (field.sourceNames ?? []).filter((name) => mapKey(name) !== mapKey(header))
    field.sourceNames = names.length ? names : undefined
    if (!names.length) {
      summary.sourceNamesAdded = summary.sourceNamesAdded.filter((code) => code !== field.code)
      summary.needsCheck = summary.needsCheck.filter(
        (item) => !(item.fieldCode === field.code && item.reason === 'SUGGESTED_SOURCE_NAME'),
      )
    }
    const present = column.values.filter((value) => !isBlank(value))
    const dataType = present.every((v) => typeof v === 'number' && Number.isSafeInteger(v))
      ? 'INTEGER'
      : present.every((v) => typeof v === 'boolean')
        ? 'BOOLEAN'
        : 'TEXT'
    const moved: DraftField = {
      code: fieldCodeFromHeader(header, new Set(fields.map((item) => item.code))),
      label: header.slice(0, 160),
      dataType,
      required: false,
      metadataKey: false,
      sadddField: false,
      ...(header.length <= MAX_NAME_LENGTH ? { sourceNames: [header] } : {}),
    }
    fields.push(moved)
    byCode.set(moved.code, moved)
    summary.addedFields.push(moved.code)
    mapping.set(column.key, moved.code)
    flag(moved.code, 'COLUMN_MOVED_OFF_CALCULATED')
    if (isAge && dataType === 'INTEGER')
      propose(moved, { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['enrollment_date'] })
  }

  function followUps() {
    for (const [index, column] of ordered.entries()) {
      const field = open(mapping.get(column.key) ?? '')
      if (!field || column.values.every(isBlank)) continue
      for (const parentColumn of ordered.slice(0, index).reverse()) {
        const parent = byCode.get(mapping.get(parentColumn.key) ?? '')
        const whenValues = (parent?.allowedValues ?? []).filter((o) => OTHER_ANSWERS.has(bare(o)))
        if (!parent || parent === field || whenValues.length === 0) continue
        const holds = rowIndexes.every(
          (row) =>
            isBlank(column.values[row]) ||
            (!isBlank(parentColumn.values[row]) &&
              OTHER_ANSWERS.has(bare(parentColumn.values[row]))),
        )
        if (!holds) continue
        propose(field, { kind: 'FOLLOW_UP_OF', parentField: parent.code, whenValues })
        break
      }
    }
  }

  function identifier() {
    const field = open('beneficiary_code')
    const code = columnFor('beneficiary_code')
    const first = columnFor('first_name')
    const last = columnFor('last_name')
    const birth = columnFor('birth_date')
    if (!field || !code || !first || !last || !birth) return
    let checked = 0
    for (const row of rowIndexes) {
      const [given, family] = [first.values[row], last.values[row]]
      const born = toDay(birth.values[row])
      if (isBlank(code.values[row]) || typeof given !== 'string' || typeof family !== 'string')
        continue
      if (!born || !given.trim() || !family.trim()) continue
      const [year, month, day] = birth.values[row]
        ? String(birth.values[row]).trim().split('-')
        : []
      const expected = `${given.trim()[0]}${family.trim()[0]}${month}${day}${year}`
      if (String(code.values[row]).trim().toUpperCase() !== expected.toUpperCase()) return
      checked++
    }
    if (checked > 0)
      propose(field, {
        kind: 'ID_FROM_INITIALS_AND_BIRTH_DATE',
        firstNameField: 'first_name',
        lastNameField: 'last_name',
        birthField: 'birth_date',
      })
  }

  washingtonGroup()
  ages()
  followUps()
  identifier()
}
