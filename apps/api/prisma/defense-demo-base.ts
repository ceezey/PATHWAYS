import type { CreateProjectDto } from '../src/modules/projects/projects.dto'
import { addDaysIso, demoPrograms } from './local-demo-data'
import type { DemoContext } from './local-demo-seed'

/** Ensures the base program EDU-2026 and project SSG-ES-2026 the stages build on; idempotent by code. */
export async function ensureBaseWorkspace(ctx: DemoContext) {
  const base = demoPrograms.find((plan) => plan.code === 'EDU-2026')
  const where = { organizationId: ctx.organizationId, code: 'EDU-2026' }
  const program =
    (await ctx.owner.program.findFirst({ where })) ??
    (await ctx.owner.program.create({
      data: {
        ...where,
        name: base?.name ?? 'Inclusive Education Program',
        description:
          base?.description ??
          'Keeps girls and boys in safe, inclusive schools in Eastern Visayas.',
        managerUserId: ctx.staff.programManager.userId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2028-12-31T00:00:00.000Z'),
        status: 'ONGOING',
      },
    }))
  const project = await ctx.owner.project.findFirst({
    where: { organizationId: ctx.organizationId, code: 'SSG-ES-2026' },
    select: { id: true },
  })
  if (project) return
  // The service also writes the team assignments; dates mirror the base seed's March 2026 to August 2027 window.
  await ctx.services.projects.create(ctx.staff.projectManager.identity, {
    code: 'SSG-ES-2026',
    title: 'Safe Schools for Girls – Eastern Samar',
    description:
      'Strengthens school-based protection and learning continuity for adolescent girls in typhoon-affected municipalities of Eastern Samar.',
    objectives:
      'Reduce school dropout among girls aged 12–17 and establish functioning school protection committees.',
    implementationArea: 'Borongan City, Guiuan and Llorente, Eastern Samar',
    sector: 'Education',
    targetBeneficiaries: 1200,
    programManagerId: ctx.staff.programManager.userId,
    projectManagerId: ctx.staff.projectManager.userId,
    monitoringOfficerId: ctx.staff.me.userId,
    projectOfficerIds: [ctx.staff.liza.userId],
    startDate: addDaysIso(ctx.today, -217),
    endDate: addDaysIso(ctx.today, 331),
    status: 'ONGOING',
    programId: program.id,
  } as CreateProjectDto)
}
