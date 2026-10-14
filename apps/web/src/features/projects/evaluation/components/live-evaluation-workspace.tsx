'use client'

import { useCurrentRole } from '@/hooks/use-current-role'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { useEvaluationWorkspace } from '../hooks/use-evaluation-workspace'
import { EvaluationDialogs } from './evaluation-dialogs'
import { EvaluationListCard } from './evaluation-list-card'
import { ReviewCard } from './review-card'
import { StartEvaluationCard } from './start-evaluation-card'

export function LiveEvaluationWorkspace({ projectId }: { projectId: string }) {
  const { profile } = useCurrentRole()
  const boundary = useSensitiveDraftOwner(
    profile,
    'evaluation-screen',
    'monitoring.read',
    projectId,
    projectId,
  )
  return (
    <EvaluationContent
      key={`${boundary?.key ?? 'unavailable'}:${boundary?.generation ?? 0}`}
      projectId={projectId}
    />
  )
}
function EvaluationContent({ projectId }: { projectId: string }) {
  const workspace = useEvaluationWorkspace(projectId)
  return (
    <div className="space-y-6">
      {/* The workspace frame draws the project title; this tab keeps only its own note. */}
      <p className="text-sm text-muted-foreground">
        Criteria are set up and scored automatically from project data; start a round, review it and
        sign it off.
      </p>
      <EvaluationListCard workspace={workspace} />
      <StartEvaluationCard workspace={workspace} />
      <ReviewCard workspace={workspace} />
      <EvaluationDialogs workspace={workspace} />
    </div>
  )
}
