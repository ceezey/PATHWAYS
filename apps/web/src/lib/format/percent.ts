/** Rounds a percent to at most one decimal and drops a trailing zero. */
export const roundPercent = (value: number | string) => {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : String(value)
}

/** Splits a percent into its capped value and, above 100, the named overrun. */
export const cappedPercentParts = (value: number | string, overLabel?: string) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 100) return { value: `${roundPercent(value)}%`, over: null }
  return { value: '100%', over: overLabel ? `${roundPercent(n - 100)}% ${overLabel}` : null }
}

/** Caps a percent at 100; a label names the overrun so budget and schedule overruns still alert. */
export const formatCappedPercent = (value: number | string, overLabel?: string) => {
  const parts = cappedPercentParts(value, overLabel)
  return parts.over ? `${parts.value} (${parts.over})` : parts.value
}
