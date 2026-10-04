import { addDaysIso } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'

/** First day of the month of an ISO date. */
export const monthStartIso = (iso: string) => `${iso.slice(0, 7)}-01`

/** A day in the middle of the previous month: ten days before this month began. */
export const lastMonthIso = (iso: string) => addDaysIso(monthStartIso(iso), -10)

/** Moves the register of the fully processed Catarman import to last month, so "datasets
 * imported this month" is not everything. Services stamp the run time and cannot backdate, so
 * this is an owner update of the batch timestamps only; the batch rows stay untouched. */
export async function stageBackdate(ctx: DemoContext) {
  const batch = await ctx.owner.dataImportBatch.findFirst({
    where: {
      organizationId: ctx.organizationId,
      originalFileName: 'catarman-livelihood-participants.csv',
      status: 'PROCESSED',
    },
    select: { id: true },
  })
  if (!batch) {
    ctx.log('  backdate skipped: the processed Catarman batch is not present')
    return
  }
  const uploaded = new Date(`${lastMonthIso(ctx.today)}T01:00:00.000Z`)
  const minutes = (count: number) => new Date(uploaded.getTime() + count * 60_000)
  await ctx.owner.dataImportBatch.update({
    where: { id: batch.id },
    data: {
      uploadedAt: uploaded,
      createdAt: uploaded,
      validatedAt: minutes(4),
      processedAt: minutes(9),
      updatedAt: minutes(9),
    },
  })
  ctx.log(`  import batch moved to ${lastMonthIso(ctx.today)}`)
}
