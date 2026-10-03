const skipWords = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
])

const words = (value: string) =>
  value.split(/[^A-Za-z0-9]+/).filter((word) => word && !skipWords.has(word.toLowerCase()))

// Initials of the significant words, or the leading letters of a single word.
const abbreviate = (value: string, max: number) => {
  const parts = words(value)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, Math.min(max, 2))
  return parts
    .map((word) => word[0])
    .join('')
    .slice(0, max)
}

/** Readable project code such as CRL-NS-2026: title initials, area initials and start year. */
export function projectCodeBase(input: { title: string; area?: string; startDate?: string }) {
  const [name, suffix] = input.title.split(/\s+[-–—]\s+/)
  // The province is the last comma part of the area, falling back to the title's location suffix.
  const place = input.area?.split(',').pop()?.trim() || suffix || ''
  const year = /^\d{4}/.exec(input.startDate ?? '')?.[0] ?? String(new Date().getFullYear())
  return [abbreviate(name ?? '', 3) || 'PRJ', abbreviate(place, 3), year]
    .filter(Boolean)
    .join('-')
    .toUpperCase()
}

/** First free code: the base, then base-2, base-3 and so on. */
export function uniqueProjectCode(base: string, taken: Iterable<string>) {
  const used = new Set([...taken].map((code) => code.toUpperCase()))
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
}
