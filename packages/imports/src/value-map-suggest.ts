import { answerResolver, stripLetterPrefix } from './answers'
import { IMPORT_VALUE_MAP_LIMITS, type ImportValueMapEntry, mapKey } from './value-map'

/** Source words for a meaning, after the letter prefix is removed; matched as whole values only. */
const SYNONYMS: ReadonlyArray<{ words: readonly string[]; targets: readonly string[] }> = [
  { words: ['babae', 'female', 'f', 'woman', 'girl'], targets: ['FEMALE'] },
  { words: ['lalaki', 'male', 'm', 'man', 'boy'], targets: ['MALE'] },
  { words: ['non-binary', 'nonbinary'], targets: ['OTHER'] },
  { words: ['prefer not to say', 'ayaw sabihin'], targets: ['PREFER_NOT_TO_SAY'] },
  { words: ['true', 'yes', 'y', 'oo', 'opo', '1'], targets: ['true', 'YES', 'WITH_DISABILITY'] },
  { words: ['false', 'no', 'n', 'hindi', '0'], targets: ['false', 'NO', 'WITHOUT_DISABILITY'] },
]

const comparable = (value: string) => mapKey(value).replace(/[\s_-]+/g, ' ')

export interface ValueMapSuggestion {
  pairs: ImportValueMapEntry[]
  unmatched: string[]
}

/**
 * Proposes translations from distinct source values to a field's allowed values. A value is
 * paired only when exactly one allowed value fits: the same text once a lettered prefix such
 * as "A. " is removed, or a known synonym. Everything else is left for the reviewer.
 */
export function suggestValueMap(
  sourceValues: readonly string[],
  allowedValues: readonly string[],
  existing: readonly ImportValueMapEntry[] = [],
): ValueMapSuggestion {
  const allowed = new Map(allowedValues.map((value) => [comparable(value), value]))
  const taken = new Set(existing.map((pair) => mapKey(pair.from)))
  const pairs: ImportValueMapEntry[] = []
  const unmatched: string[] = []
  for (const raw of sourceValues) {
    const from = raw.trim()
    const key = mapKey(from)
    if (!key || taken.has(key) || allowedValues.includes(from)) continue
    taken.add(key)
    const stripped = comparable(stripLetterPrefix(key))
    const synonym = SYNONYMS.find((group) =>
      group.words.some((word) => comparable(word) === stripped),
    )
    const candidates = new Set(
      [
        allowed.get(stripped),
        ...(synonym?.targets ?? []).map((target) => allowed.get(comparable(target))),
      ].filter((value): value is string => value !== undefined),
    )
    const room = existing.length + pairs.length < IMPORT_VALUE_MAP_LIMITS.maxEntries
    if (candidates.size === 1 && room && from.length <= IMPORT_VALUE_MAP_LIMITS.maxTextLength) {
      pairs.push({ from, to: [...candidates][0] as string })
    } else {
      unmatched.push(from)
    }
  }
  return { pairs, unmatched }
}

/** The field facts the automatic reading needs. */
export interface TranslatedField {
  dataType: string
  allowedValues?: readonly string[] | null
  valueAliases?: readonly ImportValueMapEntry[] | null
}

/** The value Suggest would pair with one cell of a true/false or single choice field, else null. */
export function automaticValue(raw: string, field: TranslatedField): string | null {
  const targets =
    field.dataType === 'BOOLEAN'
      ? ['true', 'false']
      : field.dataType === 'SELECT'
        ? (field.allowedValues ?? [])
        : []
  return targets.length ? (suggestValueMap([raw], targets).pairs[0]?.to ?? null) : null
}

/** Which of a column's values import reads automatically, and which nothing converts. */
export function columnTranslations(
  values: readonly string[],
  field: TranslatedField,
  saved: readonly ImportValueMapEntry[],
): { automatic: ImportValueMapEntry[]; unmatched: string[] } {
  const automatic: ImportValueMapEntry[] = []
  const unmatched: string[] = []
  if (field.dataType !== 'BOOLEAN' && field.dataType !== 'SELECT') return { automatic, unmatched }
  const savedKeys = new Set(
    saved.filter((pair) => pair.from.trim()).map((pair) => mapKey(pair.from)),
  )
  const known = answerResolver(field.allowedValues ?? [], field.valueAliases ?? [])
  for (const value of values) {
    if (savedKeys.has(mapKey(value))) continue
    const native =
      field.dataType === 'BOOLEAN' ? /^(true|false)$/i.test(value.trim()) : known(value) !== null
    if (native) continue
    const to = automaticValue(value, field)
    if (to) automatic.push({ from: value, to })
    else unmatched.push(value)
  }
  return { automatic, unmatched }
}
