/** Rounds a percent to at most one decimal and drops a trailing zero. */
export const roundPercent = (value: number | string) => {
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : String(value)
}

/** Caps a percent at 100; a label names the overrun so budget and schedule overruns still alert. */
export const formatCappedPercent = (value: number | string, overLabel?: string) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 100) return `${roundPercent(value)}%`
  return overLabel ? `100% (${roundPercent(n - 100)}% ${overLabel})` : '100%'
}
