import type { Prisma } from '@prisma/client'

export const stageSelection = {
  id: true,
  projectId: true,
  code: true,
  name: true,
  stageOrder: true,
  stageType: true,
  parentStageId: true,
  isTerminal: true,
  description: true,
  archivedAt: true,
  updatedAt: true,
  activityJourneyStageMapping_stage: {
    select: { activityId: true },
    orderBy: { sequenceOrder: 'asc' as const },
    take: 100,
  },
} satisfies Prisma.JourneyStageSelect

export function mapStage(stage: Prisma.JourneyStageGetPayload<{ select: typeof stageSelection }>) {
  return {
    id: stage.id,
    projectId: stage.projectId,
    code: stage.code,
    name: stage.name,
    order: stage.stageOrder,
    type: { ENTRY: 'Entry', CORE: 'Core', BRANCH: 'Branch', FOLLOW_UP: 'Follow-Up' }[
      stage.stageType
    ],
    parentStageId: stage.parentStageId ?? undefined,
    terminal: stage.isTerminal,
    mappedActivityIds: stage.activityJourneyStageMapping_stage.map((mapping) => mapping.activityId),
    description: stage.description ?? '',
    archived: Boolean(stage.archivedAt),
    updatedAt: stage.updatedAt.toISOString(),
  }
}
