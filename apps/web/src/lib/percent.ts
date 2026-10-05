/** Shows a target percent capped at 100 and names any overrun so it still alerts. */
export const formatCappedPercent = (value: number | string, overLabel = 'over target') => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 100) return `${value}%`
  return `100% (${Math.round((n - 100) * 10) / 10}% ${overLabel})`
}
