import type { CreateLibraryEntryInput } from '@pathways/shared'
import type { ProjectKey } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { projectOf, step } from './local-demo-util'

type IndicatorRow = {
  id: string
  code: string
  periodStart: string
  periodEnd: string
  measurementId: string | null
  measurementSource: string | null
}

const correctionSource = 'Data quality review'

type LibraryPlan = { entry: Omit<CreateLibraryEntryInput, 'clientMutationId'>; project: ProjectKey }

const libraryPlans: LibraryPlan[] = [
  {
    // A manual definition reused on Northern Samar through the library.
    project: 'CRL',
    entry: {
      code: 'LIB-HH-VISITED',
      name: 'Households visited by field staff',
      description: 'Distinct households that received at least one monitoring or coaching visit.',
      unitLabel: 'households',
      dataSource: 'Field visit logs',
      mode: 'MANUAL',
      numericKind: 'COUNT',
      direction: 'HIGHER_IS_BETTER',
      displayPrecision: 0,
    },
  },
  {
    // A derived definition: the share of planned activities completed, bound by its recipe.
    project: 'SSG',
    entry: {
      code: 'LIB-ACT-COMPLETE',
      name: 'Share of planned activities completed',
      description: 'Completed activities over all non-cancelled activities of the project.',
      unitLabel: 'percent',
      dataSource: 'Activity records',
      mode: 'DERIVED',
      numericKind: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
      displayPrecision: 2,
      recipe: 'ACTIVITY_COMPLETION_PERCENTAGE',
    },
  },
]

const libraryReadings: Record<string, string[]> = { 'LIB-HH-VISITED': ['85', '160', '240'] }

/** Latest value corrected after a data quality review: project, indicator code, corrected value. */
const corrections: Array<[ProjectKey, string, string]> = [
  ['SSG', 'SSG-GIRLS-ENR', '541'],
  ['CRL', 'CRL-HH-DIV', '272'],
  ['ALS', 'ALS-COMPLETION', '86.00'],
]

const listIndicators = async (ctx: DemoContext, projectId: string) =>
  (await ctx.services.indicators.list(
    ctx.staff.me.identity,
    projectId,
  )) as unknown as IndicatorRow[]

/** Library definitions, one indicator per definition copied from the library, and correction
 * chains on a few manual indicators, all by the Monitoring and Evaluation Officer. */
export async function stageMonitoring(ctx: DemoContext) {
  const me = ctx.staff.me.identity
  const { library } = ctx.services
  const entries = (await library.list(me)) as Array<{ id: string; code: string }>
  let used = 0
  for (const plan of libraryPlans) {
    const { code } = plan.entry
    const entry =
      entries.find((row) => row.code === code) ??
      ((await step(`library ${code}`, () =>
        library.create(me, { ...plan.entry, clientMutationId: ctx.stable(`library:${code}`) }),
      )) as { id: string })
    const projectId = projectOf(ctx, plan.project)
    const existing = await listIndicators(ctx, projectId)
    if (existing.some((row) => row.code === code)) continue
    // Every indicator of a project shares one reporting period, so reuse the existing one.
    const { periodStart, periodEnd } = existing[0]
    const created = (await step(`indicator ${code}`, () =>
      library.createProjectIndicator(me, projectId, {
        libraryEntryId: entry.id,
        clientMutationId: ctx.stable(`library-use:${code}:${plan.project}`),
        periodStart,
        periodEnd,
        baseline: plan.entry.mode === 'DERIVED' ? '0.00' : '0',
        target: plan.entry.mode === 'DERIVED' ? '100.00' : '600',
      }),
    )) as unknown as { id: string }
    let previous: string | null = null
    for (const [index, value] of (libraryReadings[code] ?? []).entries()) {
      const result = (await ctx.services.indicators.measure(me, projectId, created.id, {
        clientMeasurementId: ctx.stable(`measure:${code}:${index}`),
        periodStart,
        periodEnd,
        value,
        source: 'Field visit logs',
        ...(previous
          ? {
              correctsMeasurementId: previous,
              correctionReason: 'Updated with the latest visit log.',
            }
          : {}),
      })) as unknown as { measurementId: string | null }
      previous = result.measurementId
    }
    used += 1
  }

  let corrected = 0
  for (const [key, code, value] of corrections) {
    const projectId = projectOf(ctx, key)
    const row = (await listIndicators(ctx, projectId)).find((entry) => entry.code === code)
    if (!row?.measurementId || row.measurementSource === correctionSource) continue
    await step(`correction ${code}`, () =>
      ctx.services.indicators.measure(me, projectId, row.id, {
        clientMeasurementId: ctx.stable(`correction:${code}`),
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        value,
        source: correctionSource,
        correctsMeasurementId: row.measurementId,
        correctionReason: 'Corrected a transcription error found during the data quality review.',
      }),
    )
    corrected += 1
  }
  ctx.log(`  library entries used: ${used}, corrections recorded: ${corrected}`)
}
