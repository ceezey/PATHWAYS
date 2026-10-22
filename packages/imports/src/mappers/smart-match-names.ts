import {
  AUTO_SMART_V2_LIMITS,
  SMART_REVIEW_SYNONYMS_V2,
  SMART_SYNONYMS_V2,
  STOP_WORDS,
  type SmartMatchField,
  type SmartMatchReason,
  TIER,
} from './smart-match-rules'

/** The approved V1 normalizer (p29_mapping_name_v1): NFKC, ASCII trim and A-Z folding. */
export function normalizeMappingNameV1(value: string) {
  return value
    .normalize('NFKC')
    .replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '')
    .replace(/[A-Z]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 32))
    .replace(/[ \t\n\r\f\v-]+/g, '_')
}

/** V1 name split into tokens on underscores and ASCII punctuation. */
function tokensOf(v1Name: string) {
  return v1Name.split(/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]+/).filter(Boolean)
}

export interface PreparedName {
  v1: string
  canonical: string
  codePoints: number[]
  tokens: ReadonlySet<string>
  content: ReadonlySet<string>
}

export function prepareName(value: string): PreparedName {
  const v1 = normalizeMappingNameV1(value)
  const tokens = tokensOf(v1)
  const canonical = tokens.join('_')
  const content = tokens.filter((token) => !STOP_WORDS.has(token))
  return {
    v1,
    canonical,
    codePoints: Array.from(canonical, (character) => character.codePointAt(0) ?? 0),
    tokens: new Set(tokens),
    content: new Set(content),
  }
}

function canonicalSynonyms(source: Readonly<Record<string, readonly string[]>>) {
  const result = new Map<string, ReadonlySet<string>>()
  for (const [code, names] of Object.entries(source)) {
    result.set(
      normalizeMappingNameV1(code),
      new Set(names.map((name) => prepareName(name).canonical)),
    )
  }
  return result
}

const AUTOMATIC_SYNONYMS = canonicalSynonyms(SMART_SYNONYMS_V2)

const REVIEW_SYNONYMS = canonicalSynonyms(SMART_REVIEW_SYNONYMS_V2)

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false
  for (const item of left) if (!right.has(item)) return false
  return true
}

// Reused rows for the common case; the function is synchronous, so it never interleaves.
const rowBuffers = [
  new Int32Array(AUTO_SMART_V2_LIMITS.maxEditCodePoints + 1),
  new Int32Array(AUTO_SMART_V2_LIMITS.maxEditCodePoints + 1),
]

/**
 * Levenshtein distance limited to `limit`: exact when the distance is at most
 * `limit`, otherwise `limit + 1`. Work is bounded by length * (2 * limit + 1).
 */
export function boundedEditDistance(
  left: readonly number[],
  right: readonly number[],
  limit: number,
) {
  const outside = limit + 1
  if (Math.abs(left.length - right.length) > limit) return outside
  const width = right.length
  const reuse = width < rowBuffers[0].length
  let previous = reuse ? rowBuffers[0] : new Int32Array(width + 1)
  let current = reuse ? rowBuffers[1] : new Int32Array(width + 1)
  for (let j = 0; j <= width; j++) previous[j] = j <= limit ? j : outside
  for (let i = 1; i <= left.length; i++) {
    const low = i - limit > 1 ? i - limit : 1
    const high = i + limit < width ? i + limit : width
    const character = left[i - 1]
    let diagonal = previous[low - 1]
    let before = low === 1 && i <= limit ? i : outside
    current[low - 1] = before
    let rowMinimum = before
    for (let j = low; j <= high; j++) {
      const above = previous[j]
      let value = diagonal + (character === right[j - 1] ? 0 : 1)
      if (above + 1 < value) value = above + 1
      if (before + 1 < value) value = before + 1
      if (value > outside) value = outside
      current[j] = value
      if (value < rowMinimum) rowMinimum = value
      diagonal = above
      before = value
    }
    if (high < width) current[high + 1] = outside
    if (rowMinimum > limit) return outside
    const swap = previous
    previous = current
    current = swap
  }
  return previous[width] < outside ? previous[width] : outside
}

interface ScoredName {
  score: number
  reason: SmartMatchReason
}

/** Name tiers after exact and synonym checks. Below the suggestion floor scores 0. */
function similarity(source: PreparedName, target: PreparedName): ScoredName | null {
  if (source.content.size > 0 && setsEqual(source.content, target.content)) {
    return { score: TIER.tokenSet, reason: 'TOKEN_SET' }
  }
  let score = 0
  let reason: SmartMatchReason = 'TOKEN_OVERLAP'
  const left = source.content.size > 0 ? source.content : source.tokens
  const right = target.content.size > 0 ? target.content : target.tokens
  let shared = 0
  for (const token of left) if (right.has(token)) shared++
  const union = left.size + right.size - shared
  if (union > 0 && shared > 0) score = Math.floor((TIER.tokenOverlap * shared) / union)
  const longer = Math.max(source.codePoints.length, target.codePoints.length)
  if (longer > 0 && longer <= AUTO_SMART_V2_LIMITS.maxEditCodePoints && score < TIER.editDistance) {
    // A distance above longer / 7 scores below the suggestion floor, so it is not computed.
    const limit = Math.floor(longer / 7)
    const distance = boundedEditDistance(source.codePoints, target.codePoints, limit)
    const edit =
      distance <= limit ? Math.floor((TIER.editDistance * (longer - distance)) / longer) : 0
    if (edit > score) {
      score = edit
      reason = 'EDIT_DISTANCE'
    }
  }
  return score >= AUTO_SMART_V2_LIMITS.suggestionScore ? { score, reason } : null
}

export interface PreparedField {
  field: SmartMatchField
  code: PreparedName
  label: PreparedName
  allowed: ReadonlySet<string>
  /** Canonical source names this field owns alone; empty in V2. */
  sourceNames: ReadonlySet<string>
  /** True only in V3 for a calculated field. */
  calculated: boolean
  /** Resolves a SELECT answer through aliases and letter prefixes; V3 only. */
  resolve?: (raw: string) => string | null
}

export function nameScore(source: PreparedName, target: PreparedField): ScoredName | null {
  if (source.v1 === '') return null
  if (target.sourceNames.has(source.canonical)) {
    return { score: TIER.sourceName, reason: 'METADATA_SOURCE_NAME' }
  }
  if (source.v1 === target.code.v1 || source.v1 === target.label.v1) {
    return { score: TIER.exact, reason: 'EXACT' }
  }
  // A calculated field is never guessed from a looser name (V3).
  if (target.calculated) return null
  if (AUTOMATIC_SYNONYMS.get(target.code.v1)?.has(source.canonical)) {
    return { score: TIER.synonym, reason: 'SYNONYM' }
  }
  // A review-only synonym stays in the suggestion band, whatever else would match.
  if (REVIEW_SYNONYMS.get(target.code.v1)?.has(source.canonical)) {
    return { score: TIER.reviewSynonym, reason: 'SYNONYM_REVIEW' }
  }
  const byCode = similarity(source, target.code)
  const byLabel = similarity(source, target.label)
  if (!byCode) return byLabel
  if (!byLabel) return byCode
  return byLabel.score > byCode.score ? byLabel : byCode
}
