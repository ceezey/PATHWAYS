// Day arithmetic for the defense snapshot: Manila calendar days, the restore shift and its warnings.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** The Asia/Manila calendar day of an instant, as YYYY-MM-DD. */
export const manilaDay = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)

function dayMs(day) {
  const ms = ISO_DAY.test(day) ? Date.parse(`${day}T00:00:00Z`) : Number.NaN
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day)
    throw new Error(`Invalid day ${day}; expected YYYY-MM-DD.`)
  return ms
}

/** Whole days from the seed day to the restore day; never negative. */
export function dayDelta(seedDay, restoreDay) {
  const delta = (dayMs(restoreDay) - dayMs(seedDay)) / DAY_MS
  if (delta < 0)
    throw new Error(
      `Restore day ${restoreDay} is before seed day ${seedDay}; refusing to shift dates backwards.`,
    )
  return delta
}

/** Non-fatal restore warnings: a month change and shifted timestamps that land after now. */
export function restoreWarnings({ seedDay, restoreDay, dumpedAt, now = new Date() }) {
  const warnings = []
  if (seedDay.slice(0, 7) !== restoreDay.slice(0, 7))
    warnings.push(
      'Seed and restore fall in different months; month-relative demo data (imports this month) may not read as seeded.',
    )
  const latest = Date.parse(dumpedAt) + dayDelta(seedDay, restoreDay) * DAY_MS
  if (latest > now.getTime())
    warnings.push(
      `Shifted timestamps reach ${new Date(latest).toISOString()}, after now; restore later in the day or seed earlier.`,
    )
  return warnings
}
