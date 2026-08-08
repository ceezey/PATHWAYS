import type {
  Activity,
  BeneficiaryParticipationRecord,
  BeneficiaryRecord,
  JourneyStageConfig,
} from '@/types/pathways'

export const enrollmentTone = (status: BeneficiaryRecord['enrollmentStatus']) => {
  switch (status) {
    case 'Active':
      return 'success'
    case 'Pending Review':
      return 'warning'
    case 'Completed':
      return 'info'
    case 'Exited':
      return 'neutral'
    default:
      return 'neutral'
  }
}

type SearchableBeneficiary = Pick<
  BeneficiaryRecord,
  'code' | 'displayName' | 'firstName' | 'middleName' | 'lastName'
>

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const matchesBeneficiarySearch = (beneficiary: SearchableBeneficiary, search: string) => {
  const queryTokens = normalizeSearchText(search).split(/\s+/).filter(Boolean)

  if (queryTokens.length === 0) {
    return true
  }

  const fullName = [beneficiary.firstName, beneficiary.middleName, beneficiary.lastName]
    .filter(Boolean)
    .join(' ')
  const searchableText = normalizeSearchText(
    [beneficiary.code, beneficiary.displayName, fullName].join(' '),
  )

  return queryTokens.every((token) => searchableText.includes(token))
}

export const stageTypeTone = (type: JourneyStageConfig['type']) => {
  switch (type) {
    case 'Entry':
      return 'info'
    case 'Core':
      return 'success'
    case 'Branch':
      return 'warning'
    case 'Follow-Up':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export const stageForActivity = (
  activityId: string,
  stages: JourneyStageConfig[],
  activities: Activity[],
) => {
  const configuredStage = stages.find((stage) => stage.mappedActivityIds.includes(activityId))

  if (configuredStage) {
    return configuredStage
  }

  const activity = activities.find((item) => item.id === activityId)
  return activity ? stages.find((stage) => stage.id === activity.journeyStageId) : undefined
}

export const deriveCurrentStage = (
  participation: BeneficiaryParticipationRecord[],
  stages: JourneyStageConfig[],
  activities: Activity[],
) => {
  // TODO(BACKEND): Calculate current journey stage and progression rate.
  const orderedParticipation = [...participation].sort((first, second) =>
    first.participatedAt.localeCompare(second.participatedAt),
  )
  const completedStages = orderedParticipation
    .map((record) => stageForActivity(record.activityId, stages, activities))
    .filter((stage): stage is JourneyStageConfig => Boolean(stage))

  return (
    completedStages.at(-1) ?? [...stages].sort((first, second) => first.order - second.order)[0]
  )
}

export const progressionRate = (
  participation: BeneficiaryParticipationRecord[],
  stages: JourneyStageConfig[],
  activities: Activity[],
) => {
  const reachedStageIds = new Set(
    participation
      .map((record) => stageForActivity(record.activityId, stages, activities)?.id)
      .filter((stageId): stageId is string => Boolean(stageId)),
  )

  return stages.length > 0 ? Math.round((reachedStageIds.size / stages.length) * 100) : 0
}

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))

export const projectTitle = (projectId: string, projects: { id: string; title: string }[]) =>
  projects.find((project) => project.id === projectId)?.title ?? projectId
