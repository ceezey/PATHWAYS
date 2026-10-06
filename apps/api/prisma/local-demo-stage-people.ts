import type { RegisterBeneficiaryDto } from '../src/modules/beneficiaries/beneficiaries.dto'
import {
  type DemoProject,
  type PlannedPerson,
  addDaysIso,
  demoActivities,
  demoCohorts,
  demoIndicators,
  demoProjects,
  planCohort,
} from './local-demo-data'
import type { DemoContext } from './local-demo-seed'
import { activityCode } from './local-demo-stage-activities'
import { asUser, projectOf } from './local-demo-util'

/** Indicators with several successive readings, entered by the Monitoring and Evaluation Officer.
 * Every indicator of a project shares one reporting period (the project dates) so the survey
 * analytics can resolve exactly one defined period. */
export async function stageIndicators(ctx: DemoContext) {
  const me = ctx.staff.me.identity
  let count = 0
  for (const project of demoProjects) {
    const projectId = projectOf(ctx, project.key)
    const row = await ctx.owner.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { startDate: true, endDate: true },
    })
    // One reporting period per project, clipped to calendar 2026 so it never exceeds 366 days.
    const projectStart = (row.startDate as Date).toISOString().slice(0, 10)
    const projectEnd = (row.endDate as Date).toISOString().slice(0, 10)
    const periodStart = projectStart > '2026-01-01' ? projectStart : '2026-01-01'
    const periodEnd = projectEnd < '2026-12-31' ? projectEnd : '2026-12-31'
    for (const indicator of demoIndicators[project.key]) {
      const existing = await ctx.owner.projectIndicator.findFirst({
        where: { organizationId: ctx.organizationId, projectId, code: indicator.code },
        select: { id: true },
      })
      let indicatorId = existing?.id
      if (!indicatorId) {
        const created = (await ctx.services.indicators.create(me, projectId, {
          code: indicator.code,
          indicatorType: indicator.indicatorType,
          name: indicator.name,
          unitLabel: indicator.unit,
          dataSource: 'Field monitoring reports and attendance records',
          mode: 'MANUAL',
          numericKind: indicator.numericKind,
          direction: 'HIGHER_IS_BETTER',
          displayPrecision: indicator.numericKind === 'COUNT' ? 0 : 2,
          periodStart,
          periodEnd,
          baseline: indicator.baseline,
          target: indicator.target,
          clientMutationId: ctx.stable(`indicator:${project.code}:${indicator.code}`),
        })) as unknown as { id: string }
        indicatorId = created.id
        count += 1
        let previous: string | null = null
        for (const [index, value] of indicator.readings.entries()) {
          const result = (await ctx.services.indicators.measure(me, projectId, indicatorId, {
            clientMeasurementId: ctx.stable(`measure:${indicator.code}:${index}`),
            periodStart,
            periodEnd,
            value,
            source: 'Field monitoring report',
            ...(previous
              ? {
                  correctsMeasurementId: previous,
                  correctionReason: 'Updated with the latest monitoring visit reading.',
                }
              : {}),
          })) as unknown as { measurementId: string | null }
          previous = result.measurementId
        }
      }
      // Links are written on the runtime role: the table forces RLS and the owner has no policy.
      const codes = indicator.activityKeys.map((key) =>
        activityCode(
          project,
          demoActivities[project.key].findIndex((a) => a.key === key),
        ),
      )
      const activities = await ctx.owner.projectActivity.findMany({
        where: { organizationId: ctx.organizationId, projectId, code: { in: codes } },
        select: { id: true },
      })
      await asUser(ctx, ctx.staff.me, (tx) =>
        tx.activityIndicatorLink.createMany({
          data: activities.map((activity) => ({
            organizationId: ctx.organizationId,
            projectId,
            activityId: activity.id,
            indicatorId,
            createdById: ctx.staff.me.userId,
          })),
          skipDuplicates: true,
        }),
      )
    }
  }
  ctx.log(`  indicators created: ${count}`)
}

export function registrationValues(person: PlannedPerson, project: DemoProject) {
  const minor = person.age < 18
  return {
    registration_operation: 'CREATE',
    beneficiary_code: person.code,
    subject_type: 'INDIVIDUAL',
    first_name: person.firstName,
    middle_name: person.middleName,
    last_name: person.lastName,
    sex: person.sex,
    birth_date: person.birthDate,
    disability_status: person.disability,
    location_barangay: person.barangay,
    location_city_municipality: project.cityMunicipality,
    location_province: project.province,
    consent_recorded: true,
    data_processing_consent_recorded: true,
    is_minor: minor,
    guardian_consent_recorded: minor,
    enrollment_date: person.enrollmentDate,
  }
}

export const registrarFor = (ctx: DemoContext, project: DemoProject) =>
  ctx.staff[project.officers[0]].identity

/** Beneficiaries registered through the default registration form, like a Project Officer would. */
export async function stageBeneficiaries(ctx: DemoContext) {
  let registered = 0
  for (const project of demoProjects) {
    const projectId = projectOf(ctx, project.key)
    const registrar = registrarFor(ctx, project)
    const context = await ctx.services.beneficiaries.ensureDefaultRegistrationForm(
      registrar,
      projectId,
    )
    const formId = context.definitions[0]?.id
    if (!formId) throw new Error(`No registration form is available for ${project.code}.`)
    const row = await ctx.owner.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { startDate: true },
    })
    const projectStart = (row.startDate as Date).toISOString().slice(0, 10)
    const people = planCohort(project, ctx.today, projectStart)
    for (const person of people) {
      const dto: RegisterBeneficiaryDto = {
        formId,
        clientRegistrationId: ctx.stable(`register:${project.code}:${person.code}`),
        values: registrationValues(person, project),
      }
      await ctx.services.beneficiaries.register(registrar, projectId, dto)
      registered += 1
    }
  }
  ctx.log(
    `  beneficiaries registered: ${registered} (cohorts ${Object.values(demoCohorts)
      .map((c) => c.count)
      .join('/')})`,
  )
  void addDaysIso
}
