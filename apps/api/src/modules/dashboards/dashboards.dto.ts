import { BadRequestException } from '@nestjs/common'
import {
  type DashboardQuery,
  type SadddQuery,
  dashboardQuerySchema,
  sadddQuerySchema,
} from '@pathways/shared'

export function parseSadddQuery(value: unknown): SadddQuery {
  const parsed = sadddQuerySchema.safeParse(value)

  if (!parsed.success) {
    throw new BadRequestException(
      'SADDD requires exactly one authorized project and does not accept custom periods or demographic cross-filters.',
    )
  }

  return parsed.data
}

export function parseDashboardQuery(value: unknown): DashboardQuery {
  const parsed = dashboardQuerySchema.safeParse(value)
  if (!parsed.success)
    throw new BadRequestException(
      'Invalid monitoring query. Use one project/program selector and both bounded calendar dates; other filters are not enabled.',
    )
  return parsed.data
}
