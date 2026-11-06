import { type ImportValueMapEntry, mapKey } from './value-map'

const LETTER_PREFIX = /^(?:[a-z]|\d{1,2})[.)]\s+/i

/** Removes a leading "A. ", "b) " or "10. " answer label; the label must be followed by whitespace. */
export const stripLetterPrefix = (text: string) => text.trim().replace(LETTER_PREFIX, '')

export const hasLetterPrefix = (text: string) => LETTER_PREFIX.test(text.trim())

/** Case-folded text with every dash variant as "-" and whitespace runs as one space. */
export const comparableAnswer = (text: string) =>
  mapKey(text)
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')

/** Builds the comparable lookups once and returns a resolver: exact, then alias, then the text without its letter prefix. */
export function answerResolver(
  allowed: readonly string[],
  aliases: readonly ImportValueMapEntry[],
): (raw: string) => string | null {
  const exact = new Set(allowed)
  const aliasByKey = new Map<string, string>()
  for (const { from, to } of aliases) {
    const key = comparableAnswer(from)
    if (!aliasByKey.has(key)) aliasByKey.set(key, to)
  }
  const allowedByKey = new Map<string, string>()
  for (const value of allowed) {
    const key = comparableAnswer(value)
    if (!allowedByKey.has(key)) allowedByKey.set(key, value)
  }
  return (raw) =>
    (exact.has(raw) ? raw : null) ??
    aliasByKey.get(comparableAnswer(raw)) ??
    allowedByKey.get(comparableAnswer(stripLetterPrefix(raw))) ??
    null
}

/** Maps a source answer to an allowed value: exact, then alias, then the text without its letter prefix. */
export const resolveAnswer = (
  raw: string,
  allowed: readonly string[],
  aliases: readonly ImportValueMapEntry[],
): string | null => answerResolver(allowed, aliases)(raw)
