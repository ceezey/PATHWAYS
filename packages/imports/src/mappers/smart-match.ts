import { answerResolver } from '../answers'
import { submissionTimeColumn } from '../submission-time'
import {
  type PreparedField,
  type PreparedName,
  SYNONYMS_V2,
  SYNONYMS_V3,
  groupPathLeaf,
  nameScore,
  normalizeMappingNameV1,
  prepareName,
} from './smart-match-names'
import {
  AUTO_SMART_V2_LIMITS,
  KOBO_ODK_MARKERS_V5,
  KOBO_TIMING_COLUMNS_V5,
  PARTICIPANT_GROUP_WORDS,
  REFUSED_TAGS,
  SYSTEM_COLUMNS_V1,
  type SmartDecisionReason,
  type SmartMatchColumn,
  type SmartMatchDecision,
  type SmartMatchField,
  SmartMatchInputError,
  type SmartMatchReason,
  TIER,
} from './smart-match-rules'
import { boundedSamples, valueGate } from './smart-match-values'
export {
  AUTO_SMART_V2,
  AUTO_SMART_V3,
  AUTO_SMART_V4,
  AUTO_SMART_V5,
  AUTO_SMART_V2_LIMITS,
  SMART_DECISION_REASONS,
  SMART_MATCH_REASONS,
  SMART_REVIEW_SYNONYMS_V2,
  SMART_REVIEW_SYNONYMS_V3,
  SMART_SYNONYMS_V2,
  SMART_SYNONYMS_V2_ID,
  SMART_SYNONYMS_V3,
  SMART_SYNONYMS_V3_ID,
  SYSTEM_COLUMNS_V1,
  type SmartDecisionReason,
  type SmartMatchColumn,
  type SmartMatchDecision,
  type SmartMatchField,
  SmartMatchInputError,
  type SmartMatchReason,
} from './smart-match-rules'
export {
  boundedEditDistance,
  groupPathLeaf,
  normalizeMappingNameV1,
  sourceNameKey,
} from './smart-match-names'

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
  return matchColumns(columns, fields, 2)
}

/** AUTO_SMART_V3: V2 plus source names, blank columns, calculated-field exclusion and answer aliases. */
export function smartMatchColumnsV3(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
): SmartMatchDecision[] {
  return matchColumns(columns, fields, 3)
}

/** AUTO_SMART_V4: V3 plus Filipino synonyms, group-path leaves and system columns. */
export function smartMatchColumnsV4(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
): SmartMatchDecision[] {
  return matchColumns(columns, fields, 4)
}

/** AUTO_SMART_V5: V4 plus calculated-field, submission time and Kobo timing ignores; a calculated ignore carries its field in suggestedFieldId for the fed check. */
export function smartMatchColumnsV5(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
): SmartMatchDecision[] {
  return matchColumns(columns, fields, 5)
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

// A group of participant words or of the leaf's own words (consent/consent_given) maps; under any other, such as emergency_contact, a person confirms it.
function participantPath(header: string, leaf: string) {
  const leafTokens = prepareName(leaf).tokens
  return [...prepareName(header.slice(0, -leaf.length)).tokens].every(
    (token) => PARTICIPANT_GROUP_WORDS.has(token) || leafTokens.has(token),
  )
}

function matchColumns(
  columns: readonly SmartMatchColumn[],
  fields: readonly SmartMatchField[],
  version: 2 | 3 | 4 | 5,
): SmartMatchDecision[] {
  const v3 = version >= 3
  const v4 = version >= 4
  const v5 = version === 5
  const synonyms = v4 ? SYNONYMS_V3 : SYNONYMS_V2
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

  // Two distinct Kobo or ODK headers mark the file, so its start, end and today columns are form timing.
  const koboFile =
    v5 &&
    new Set(
      columns
        .map((column) => normalizeMappingNameV1(column.header))
        .filter((name) => KOBO_ODK_MARKERS_V5.has(name)),
    ).size >= 2
  // Calculated fields with the V3 refusal lifted, to find the one a loose name defers to.
  const calculatedTargets = v5
    ? orderedFields
        .filter((target) => target.calculated)
        .map((target) => ({ ...target, calculated: false }))
    : []
  const calculatedFieldOf = (header: string, source: PreparedName) => {
    if ([...source.tokens].some((token) => REFUSED_TAGS.has(token))) return null
    const leaf = groupPathLeaf(header)
    const names =
      leaf !== null && participantPath(header, leaf) ? [source, prepareName(leaf)] : [source]
    const scores = calculatedTargets.map((target) =>
      Math.max(0, ...names.map((name) => nameScore(name, target, synonyms)?.score ?? 0)),
    )
    const top = Math.max(0, ...scores)
    const winners = calculatedTargets.filter((_, index) => scores[index] === top)
    return top >= AUTO_SMART_V2_LIMITS.suggestionScore && winners.length === 1
      ? winners[0].field.id
      : null
  }

  // Candidates at or above the suggestion floor, best first; field order breaks ties.
  const candidates = orderedColumns.map((column) => {
    const source = prepareName(column.header)
    // A source name a field owns outranks the system-column list, as the form publisher approved it.
    let ignoredReason: SmartDecisionReason | null =
      v3 && column.blank === true
        ? 'BLANK_COLUMN'
        : v4 &&
            SYSTEM_COLUMNS_V1.has(source.v1) &&
            !orderedFields.some((target) => target.sourceNames.has(source.canonical))
          ? 'SYSTEM_COLUMN'
          : null
    const scoreOn = (name: typeof source) => {
      const scored: Candidate[] = []
      orderedFields.forEach((target, fieldIndex) => {
        const match = nameScore(name, target, synonyms)
        if (match) scored.push({ fieldIndex, score: match.score, reason: match.reason })
      })
      return scored
    }
    let scored = ignoredReason ? [] : scoreOn(source)
    // The leaf wins only when it scores higher than the whole header, so "first-name" keeps its V3 match, and is never read when the path names someone else.
    const leaf =
      v4 && !ignoredReason && ![...source.tokens].some((t) => REFUSED_TAGS.has(t))
        ? groupPathLeaf(column.header)
        : null
    if (leaf !== null) {
      const leafName = prepareName(leaf)
      const participant = participantPath(column.header, leaf)
      const fromLeaf = scoreOn(leafName).map((candidate) =>
        participant || candidate.score <= TIER.reviewSynonym
          ? candidate
          : { ...candidate, score: TIER.reviewSynonym, reason: 'SYNONYM_REVIEW' as const },
      )
      const top = (list: Candidate[]) => Math.max(0, ...list.map((candidate) => candidate.score))
      if (top(fromLeaf) > top(scored)) scored = fromLeaf
    }
    scored.sort((left, right) => right.score - left.score || left.fieldIndex - right.fieldIndex)
    let calculatedFieldId: string | null = null
    // V5 ignores only a column V4 offers nothing for, so every other decision stays as V4 makes it.
    if (v5 && !ignoredReason && scored.length === 0) {
      if (submissionTimeColumn([column]) !== null) ignoredReason = 'SUBMISSION_TIME'
      else if (koboFile && KOBO_TIMING_COLUMNS_V5.has(source.v1)) ignoredReason = 'SYSTEM_COLUMN'
      else {
        calculatedFieldId = calculatedFieldOf(column.header, source)
        if (calculatedFieldId !== null) ignoredReason = 'CALCULATED_FIELD'
      }
    }
    const samples = boundedSamples(column.samples)
    return { column, source, scored, ignoredReason, calculatedFieldId, samples }
  })

  const bestScoreForField = new Map<number, number[]>()
  candidates.forEach((entry, columnPosition) => {
    for (const candidate of entry.scored) {
      const scores = bestScoreForField.get(candidate.fieldIndex) ?? []
      scores[columnPosition] = candidate.score
      bestScoreForField.set(candidate.fieldIndex, scores)
    }
  })

  const decisions: SmartMatchDecision[] = candidates.map(
    ({ column, ignoredReason, calculatedFieldId }) => ({
      sourceKey: column.key,
      columnIndex: column.columnIndex,
      status: ignoredReason ? 'IGNORED' : 'PENDING',
      targetFieldId: null,
      suggestedFieldId: calculatedFieldId,
      score: null,
      matchReason: null,
      reason: ignoredReason ?? 'NO_MATCH',
    }),
  )
  const held = new Map<number, SmartDecisionReason>()
  const claimed = new Set<number>()

  candidates.forEach((entry, position) => {
    const decision = decisions[position]
    if (entry.ignoredReason) return
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
    const gate = valueGate(entry.samples, orderedFields[best.fieldIndex], v4)
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
