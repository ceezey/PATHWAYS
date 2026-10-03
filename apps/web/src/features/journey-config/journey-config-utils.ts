import { CircleDot, Flag, GitBranch, type LucideIcon, Repeat } from 'lucide-react'

import type { JourneyStageConfig, JourneyStageType } from '@/types/pathways'

export const stageTypes: JourneyStageType[] = ['Entry', 'Core', 'Branch', 'Follow-Up']

export const stageTypeStyle: Record<
  JourneyStageType,
  { icon: LucideIcon; node: string; guide: string }
> = {
  Entry: {
    icon: Flag,
    node: 'border-info bg-info-subtle text-info',
    guide: 'First stage. All beneficiaries begin here. Only one entry stage per journey.',
  },
  Core: {
    icon: CircleDot,
    node: 'border-border-strong bg-muted text-foreground',
    guide: 'Main sequence stage. Beneficiaries move through core stages in order.',
  },
  Branch: {
    icon: GitBranch,
    node: 'border-cyan-700 bg-cyan-100 text-cyan-900',
    guide: 'Alternate path from a parent stage. Needs a parent stage to branch from.',
  },
  'Follow-Up': {
    icon: Repeat,
    node: 'border-dashed border-warning bg-warning-subtle text-warning',
    guide: 'Post-completion stage for continued support or monitoring.',
  },
}

export type StageRow = { stage: JourneyStageConfig; parent?: JourneyStageConfig }

const byOrder = (a: JourneyStageConfig, b: JourneyStageConfig) => a.order - b.order

export const childrenOf = (stages: JourneyStageConfig[], parentId: string) =>
  stages.filter((stage) => stage.parentStageId === parentId).sort(byOrder)

export const rootStages = (stages: JourneyStageConfig[]) => {
  const ids = new Set(stages.map((stage) => stage.id))
  return stages
    .filter((stage) => !stage.parentStageId || !ids.has(stage.parentStageId))
    .sort(byOrder)
}

// Parents followed by their branch children, in stage order.
export const flattenStages = (stages: JourneyStageConfig[]): StageRow[] =>
  rootStages(stages).flatMap((root) => [
    { stage: root },
    ...childrenOf(stages, root.id).map((stage) => ({ stage, parent: root })),
  ])

export const branchSummary = (stages: JourneyStageConfig[]) =>
  rootStages(stages)
    .map((root) => ({ root, kids: childrenOf(stages, root.id) }))
    .filter(({ kids }) => kids.length > 0)
    .map(({ root, kids }) => `${root.code} -> ${kids.map((kid) => kid.code).join(' / ')}`)
    .join(', ')

export const mappedCount = (stages: JourneyStageConfig[]) =>
  new Set(stages.flatMap((stage) => stage.mappedActivityIds)).size

export const moveStage = (stages: JourneyStageConfig[], id: string, targetId: string) => {
  const ordered = stages.slice().sort(byOrder)
  const from = ordered.findIndex((stage) => stage.id === id)
  const to = ordered.findIndex((stage) => stage.id === targetId)
  if (from < 0 || to < 0 || from === to) return stages
  const [moved] = ordered.splice(from, 1)
  ordered.splice(to, 0, moved)
  const order = new Map(ordered.map((stage, index) => [stage.id, index + 1]))
  return stages.map((stage) => ({ ...stage, order: order.get(stage.id) ?? stage.order }))
}

export const validateStages = (stages: JourneyStageConfig[]) => {
  if (stages.some((stage) => !stage.code.trim() || !stage.name.trim()))
    return 'Every stage needs a code and a name.'
  if (stages.filter((stage) => stage.type === 'Entry').length > 1)
    return 'Only one entry stage is allowed per journey.'
  if (stages.some((stage) => stage.type === 'Branch' && !stage.parentStageId))
    return 'Branch stages need a parent stage.'
  return ''
}
