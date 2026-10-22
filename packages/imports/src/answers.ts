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

/** Maps a source answer to an allowed value: exact, then alias, then the text without its letter prefix. */
export function resolveAnswer(
  raw: string,
  allowed: readonly string[],
  aliases: readonly ImportValueMapEntry[],
): string | null {
  if (allowed.includes(raw)) return raw
  const key = comparableAnswer(raw)
  const alias = aliases.find((entry) => comparableAnswer(entry.from) === key)
  if (alias) return alias.to
  const stripped = comparableAnswer(stripLetterPrefix(raw))
  return allowed.find((value) => comparableAnswer(value) === stripped) ?? null
}
