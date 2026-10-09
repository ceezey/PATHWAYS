import { ServiceUnavailableException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { businessCalendarDate } from '@pathways/shared'

// Today's YYYY-MM-DD in the configured business time zone; an unusable zone answers 503.
export function currentBusinessDate(now = new Date()): string {
  try {
    return businessCalendarDate(now, readApiEnv(process.env).BUSINESS_TIME_ZONE)
  } catch {
    throw new ServiceUnavailableException('The configured business time zone is invalid.')
  }
}
