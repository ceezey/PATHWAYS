import { PathwaysClientError } from '@/lib/api/core/request'
import type { BeneficiaryJourneyHistory, JourneyStageConfig } from '@/types/pathways'

export function parseJourneyStage(value: unknown): JourneyStageConfig {
  const row = value as Partial<JourneyStageConfig>
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.code !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.order !== 'number' ||
    !['Entry', 'Core', 'Branch', 'Follow-Up'].includes(String(row.type)) ||
    typeof row.terminal !== 'boolean' ||
    !Array.isArray(row.mappedActivityIds) ||
    typeof row.description !== 'string'
  ) {
    throw new PathwaysClientError('Invalid journey-stage response.', 'network')
  }
  if (row.parentStageId !== undefined && typeof row.parentStageId !== 'string') {
    throw new PathwaysClientError('Invalid journey-stage parent response.', 'network')
  }
  return row as JourneyStageConfig
}

export function parseJourneyStages(value: unknown): JourneyStageConfig[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new PathwaysClientError('Invalid journey-stage response.', 'network')
  }
  return value.map(parseJourneyStage)
}

export function parseJourneyHistory(value: unknown): BeneficiaryJourneyHistory {
  const row = value as Partial<BeneficiaryJourneyHistory>
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.projectId !== 'string' ||
    typeof row.beneficiaryId !== 'string' ||
    typeof row.enrollmentId !== 'string' ||
    typeof row.enrollmentStatus !== 'string' ||
    !Array.isArray(row.events) ||
    row.events.length > 500
  ) {
    throw new PathwaysClientError('Invalid journey-history response.', 'network')
  }
  for (const event of row.events) {
    if (
      !event ||
      typeof event !== 'object' ||
      typeof event.id !== 'string' ||
      typeof event.eventType !== 'string' ||
      typeof event.eventDate !== 'string' ||
      typeof event.recordedAt !== 'string' ||
      typeof event.recordedBy !== 'string'
    ) {
      throw new PathwaysClientError('Invalid journey-history response.', 'network')
    }
  }
  return row as BeneficiaryJourneyHistory
}
