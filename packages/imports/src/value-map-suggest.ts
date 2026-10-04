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
const withoutPrefix = (key: string) => key.replace(/^(?:[a-z]|\d{1,2})[.)]\s+/, '')

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
    const stripped = comparable(withoutPrefix(key))
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
