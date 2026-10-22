import { answerResolver } from '../answers'
import {
  type PreparedField,
  nameScore,
  normalizeMappingNameV1,
  prepareName,
} from './smart-match-names'
import {
  AUTO_SMART_V2_LIMITS,
  type SmartDecisionReason,
  type SmartMatchColumn,
  type SmartMatchDecision,
  type SmartMatchField,
  SmartMatchInputError,
  type SmartMatchReason,
} from './smart-match-rules'
import { boundedSamples, valueGate } from './smart-match-values'
export {
  AUTO_SMART_V2,
  AUTO_SMART_V3,
  AUTO_SMART_V2_LIMITS,
  SMART_DECISION_REASONS,
  SMART_MATCH_REASONS,
  SMART_REVIEW_SYNONYMS_V2,
  SMART_SYNONYMS_V2,
  SMART_SYNONYMS_V2_ID,
  type SmartDecisionReason,
  type SmartMatchColumn,
  type SmartMatchDecision,
  type SmartMatchField,
  SmartMatchInputError,
  type SmartMatchReason,
} from './smart-match-rules'
export { boundedEditDistance, normalizeMappingNameV1 } from './smart-match-names'

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

interface Candidate {
  fieldIndex: number
  score: number
  reason: SmartMatchReason
}

/**
 * Scores every column against every field and returns one decision per column in
 * column order. A field is auto-mapped by at most one column and suggested to at
 * most one other column; ties only ever produce suggestions.
 */
export function smartMatchColumns(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
): SmartMatchDecision[] {
  return matchColumns(columns, fields, false)
}

/** AUTO_SMART_V3: V2 plus source names, blank columns, calculated-field exclusion and answer aliases. */
export function smartMatchColumnsV3(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
): SmartMatchDecision[] {
  return matchColumns(columns, fields, true)
}

/** Canonical source names that exactly one field owns; shared names are dropped. */
function ownedSourceNames(fields: readonly SmartMatchField[]) {
  const sets = fields.map(
    (field) =>
      new Set((field.sourceNames ?? []).map((name) => prepareName(name).canonical).filter(Boolean)),
  )
  const counts = new Map<string, number>()
  for (const set of sets) for (const name of set) counts.set(name, (counts.get(name) ?? 0) + 1)
  return fields.map(
    (_, index) => new Set([...sets[index]].filter((name) => counts.get(name) === 1)),
  )
}

function matchColumns(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
  v3: boolean,
): SmartMatchDecision[] {
  if (
    columns.length > AUTO_SMART_V2_LIMITS.maxColumns ||
    fields.length > AUTO_SMART_V2_LIMITS.maxFields ||
    columns.some((column) => column.header.length > AUTO_SMART_V2_LIMITS.maxNameCharacters) ||
    fields.some(
      (field) =>
        field.code.length > AUTO_SMART_V2_LIMITS.maxNameCharacters ||
        field.label.length > AUTO_SMART_V2_LIMITS.maxNameCharacters ||
        (field.allowedValues?.length ?? 0) > 100 ||
        (field.sourceNames?.length ?? 0) > 20 ||
        (field.sourceNames ?? []).some(
          (name) => name.length > AUTO_SMART_V2_LIMITS.maxNameCharacters,
        ) ||
        (field.valueAliases?.length ?? 0) > 100,
    )
  ) {
    throw new SmartMatchInputError()
  }
  const orderedColumns = [...columns].sort(
    (left, right) => left.columnIndex - right.columnIndex || compareText(left.key, right.key),
  )
  const owned = v3 ? ownedSourceNames(fields) : []
  const orderedFields: PreparedField[] = fields
    .map((field, index) => ({ field, sourceNames: owned[index] }))
    .sort(
      (left, right) =>
        compareText(left.field.code, right.field.code) ||
        compareText(left.field.id, right.field.id),
    )
    .map(({ field, sourceNames }) => ({
      field,
      code: prepareName(field.code),
      label: prepareName(field.label),
      allowed: new Set((field.allowedValues ?? []).map((value) => normalizeMappingNameV1(value))),
      sourceNames: sourceNames ?? new Set<string>(),
      calculated: v3 && field.calculated === true,
      resolve:
        v3 && (field.dataType === 'SELECT' || field.dataType === 'MULTIPLE_SELECT')
          ? answerResolver(field.allowedValues ?? [], field.valueAliases ?? [])
          : undefined,
    }))

  // Candidates at or above the suggestion floor, best first; field order breaks ties.
  const candidates = orderedColumns.map((column) => {
    const source = prepareName(column.header)
    const scored: Candidate[] = []
    const ignored = v3 && column.blank === true
    orderedFields.forEach((target, fieldIndex) => {
      const match = ignored ? null : nameScore(source, target)
      if (match) scored.push({ fieldIndex, score: match.score, reason: match.reason })
    })
    scored.sort((left, right) => right.score - left.score || left.fieldIndex - right.fieldIndex)
    return { column, source, scored, ignored, samples: boundedSamples(column.samples) }
  })

  const bestScoreForField = new Map<number, number[]>()
  candidates.forEach((entry, columnPosition) => {
    for (const candidate of entry.scored) {
      const scores = bestScoreForField.get(candidate.fieldIndex) ?? []
      scores[columnPosition] = candidate.score
      bestScoreForField.set(candidate.fieldIndex, scores)
    }
  })

  const decisions: SmartMatchDecision[] = candidates.map(({ column, ignored }) => ({
    sourceKey: column.key,
    columnIndex: column.columnIndex,
    status: ignored ? 'IGNORED' : 'PENDING',
    targetFieldId: null,
    suggestedFieldId: null,
    score: null,
    matchReason: null,
    reason: ignored ? 'BLANK_COLUMN' : 'NO_MATCH',
  }))
  const held = new Map<number, SmartDecisionReason>()
  const claimed = new Set<number>()

  candidates.forEach((entry, position) => {
    const decision = decisions[position]
    if (entry.ignored) return
    if (entry.source.v1 === '') {
      decision.reason = 'EMPTY_NAME'
      return
    }
    const best = entry.scored[0]
    if (!best || best.score < AUTO_SMART_V2_LIMITS.autoMapScore) return
    const next = entry.scored[1]?.score ?? 0
    const rivals = bestScoreForField.get(best.fieldIndex) ?? []
    const contested = rivals.some(
      (score, other) => other !== position && score !== undefined && score >= best.score,
    )
    const gate = valueGate(entry.samples, orderedFields[best.fieldIndex])
    if (contested) held.set(position, 'HELD_CONTESTED')
    else if (best.score - next < AUTO_SMART_V2_LIMITS.minimumMargin)
      held.set(position, 'HELD_MARGIN')
    else if (gate === 'NO_SAMPLES') held.set(position, 'HELD_NO_SAMPLES')
    else if (gate === 'FAIL') held.set(position, 'HELD_VALUE_GATE')
    else {
      decision.status = 'MAPPED'
      decision.targetFieldId = orderedFields[best.fieldIndex].field.id
      decision.score = best.score
      decision.matchReason = best.reason
      decision.reason = 'AUTO_MATCH'
      claimed.add(best.fieldIndex)
    }
  })

  // Suggestions: strongest first, then column order; each field at most once and
  // never a field another column already maps.
  const offers: Array<{ position: number; candidate: Candidate }> = []
  candidates.forEach((entry, position) => {
    if (decisions[position].status !== 'PENDING' || entry.source.v1 === '') return
    for (const candidate of entry.scored) offers.push({ position, candidate })
  })
  offers.sort(
    (left, right) =>
      right.candidate.score - left.candidate.score ||
      left.position - right.position ||
      left.candidate.fieldIndex - right.candidate.fieldIndex,
  )
  for (const { position, candidate } of offers) {
    const decision = decisions[position]
    if (decision.suggestedFieldId !== null || claimed.has(candidate.fieldIndex)) continue
    claimed.add(candidate.fieldIndex)
    decision.suggestedFieldId = orderedFields[candidate.fieldIndex].field.id
    decision.score = candidate.score
    decision.matchReason = candidate.reason
  }
  decisions.forEach((decision, position) => {
    if (decision.status !== 'PENDING' || decision.reason === 'EMPTY_NAME') return
    decision.reason =
      held.get(position) ?? (decision.suggestedFieldId !== null ? 'SUGGESTED' : 'NO_MATCH')
  })
  return decisions
}
