import type { Prisma } from '@prisma/client'

type ReleasedCell = { count: number | null; suppressed: boolean }

/** One breakdown released exactly; the suppression flags stay in the contract and are always false. */
export function releaseBreakdown<T extends { count: number }>(total: number, items: T[]) {
  return {
    total,
    totalSuppressed: false,
    items: items.map((item) => ({ ...item, suppressed: false })) as Array<
      Omit<T, 'count'> & ReleasedCell
    >,
  }
}

type MeasurementRow = {
  id: string
  indicatorId: string
  periodStart: Date
  periodEnd: Date
  value: Prisma.Decimal | number
  correctsMeasurementId: string | null
  recordedAt: Date
}

const day = (d: Date) => d.toISOString().slice(0, 10)

/** Keeps only the current value per (indicator, period): rows that another row corrects are dropped. */
export function currentMeasurements(rows: MeasurementRow[]) {
  const superseded = new Set(rows.map((r) => r.correctsMeasurementId).filter(Boolean))
  const latest = new Map<string, MeasurementRow>()
  for (const row of rows) {
    if (superseded.has(row.id)) continue
    const key = `${row.indicatorId}|${day(row.periodStart)}|${day(row.periodEnd)}`
    const seen = latest.get(key)
    if (!seen || seen.recordedAt < row.recordedAt) latest.set(key, row)
  }
  return [...latest.values()]
    .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime())
    .map((row) => ({
      indicatorId: row.indicatorId,
      periodStart: day(row.periodStart),
      periodEnd: day(row.periodEnd),
      value: Number(row.value),
    }))
}

const cents = (value: Prisma.Decimal | number) => Math.round(Number(value) * 100)

/** Per-currency planned, approved and pending totals; utilization counts approved spend only. */
export function summarizeBudget(
  budgets: Array<{ currency: string; plannedBudget: Prisma.Decimal | number }>,
  expenses: Array<{ currency: string; amount: Prisma.Decimal | number; status: string }>,
) {
  const sums = new Map<string, { planned: number; approved: number; pending: number }>()
  const slot = (currency: string) => {
    const found = sums.get(currency) ?? { planned: 0, approved: 0, pending: 0 }
    sums.set(currency, found)
    return found
  }
  for (const b of budgets) slot(b.currency).planned += cents(b.plannedBudget)
  for (const e of expenses) {
    if (e.status === 'APPROVED') slot(e.currency).approved += cents(e.amount)
    else if (e.status === 'PENDING' || e.status === 'VERIFIED')
      slot(e.currency).pending += cents(e.amount)
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, s]) => ({
      currency,
      planned: s.planned / 100,
      approved: s.approved / 100,
      pending: s.pending / 100,
      utilizationPercent: s.planned > 0 ? Math.round((s.approved / s.planned) * 1000) / 10 : null,
    }))
}
