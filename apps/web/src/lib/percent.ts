/** Caps a percent at 100; a label names the overrun so budget and schedule overruns still alert. */
export const formatCappedPercent = (value: number | string, overLabel?: string) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 100) return `${value}%`
  return overLabel ? `100% (${Math.round((n - 100) * 10) / 10}% ${overLabel})` : '100%'
}
