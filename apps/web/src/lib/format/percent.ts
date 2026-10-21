/** Rounds a percent to at most `digits` decimals and drops trailing zeros. */
export const roundPercent = (value: number | string, digits = 1) => {
  const n = Number(value)
  const scale = 10 ** digits
  return Number.isFinite(n) ? String(Math.round(n * scale) / scale) : String(value)
}

/** What a percent above 100 measures, so the overrun can be explained. */
export type Overrun = 'budget' | 'schedule' | 'target'

const overrunCauses: Record<Overrun, string> = {
  budget:
    'Approved expenses are higher than the planned budget. Utilization is approved expenses divided by the planned budget, times 100.',
  schedule:
    'The project has run past its scheduled end date. Timeline elapsed is the days passed since the start divided by the scheduled duration in days, times 100.',
  target:
    'The latest value has gone past the target. Progress is the change from the baseline divided by the planned change to the target, times 100.',
}

/** Splits a percent into its capped value and, above 100, the signed overrun. */
export const cappedPercentParts = (value: number | string, digits = 1) => {
  const shown = Number(roundPercent(value, digits))
  if (!Number.isFinite(shown) || shown <= 100)
    return { value: `${roundPercent(value, digits)}%`, over: null }
  return { value: '100%', over: `+${roundPercent(shown - 100, digits)}%` }
}

/** Caps a percent at 100 and keeps any overrun visible, e.g. 100% (+8.1%). */
export const formatCappedPercent = (value: number | string, digits = 1) => {
  const parts = cappedPercentParts(value, digits)
  return parts.over ? `${parts.value} (${parts.over})` : parts.value
}

/** Explains a capped percent: the actual figure, then why it can pass 100%. */
export const overrunReason = (value: number | string, overrun?: Overrun, digits = 1) => {
  const parts = cappedPercentParts(value, digits)
  const actual = `The computed value is ${roundPercent(value, digits)}%, ${parts.over?.slice(1)} above the 100% shown.`
  return overrun ? `${actual} ${overrunCauses[overrun]}` : actual
}
