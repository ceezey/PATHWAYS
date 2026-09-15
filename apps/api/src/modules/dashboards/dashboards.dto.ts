import { BadRequestException } from '@nestjs/common'
import { type DashboardQuery, dashboardQuerySchema } from '@pathways/shared'
export function parseDashboardQuery(value: unknown): DashboardQuery {
  const parsed = dashboardQuerySchema.safeParse(value)
  if (!parsed.success) throw new BadRequestException('Invalid monitoring query. Use one project/program selector and both bounded calendar dates; other filters are not enabled.')
  return parsed.data
}
