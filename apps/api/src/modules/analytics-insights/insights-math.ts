import type { Prisma } from '@prisma/client'

const SMALL_CELL_MAX = 4

type SuppressedCell = { count: number | null; suppressed: boolean }

const isSmall = (n: number) => n >= 1 && n <= SMALL_CELL_MAX

/**
 * Small-cell suppression for one breakdown: counts 1-4 are hidden, a lone hidden cell also hides
 * the smallest other non-zero cell, and a 1-4 total hides everything.
 */
export function suppressBreakdown<T extends { count: number }>(total: number, items: T[]) {
  const totalSuppressed = isSmall(total)
  const hidden = items.map((item) => totalSuppressed || isSmall(item.count))
  if (!totalSuppressed && hidden.filter(Boolean).length === 1) {
    let pick = -1
    items.forEach((item, i) => {
      if (!hidden[i] && item.count > 0 && (pick < 0 || item.count < (items[pick]?.count ?? 0)))
        pick = i
    })
    if (pick >= 0) hidden[pick] = true
  }
  return {
    total: totalSuppressed ? null : total,
    totalSuppressed,
    items: items.map((item, i) => ({
      ...item,
      count: hidden[i] ? null : item.count,
      suppressed: hidden[i] ?? false,
    })) as Array<Omit<T, 'count'> & SuppressedCell>,
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
