'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { rulesHumanClient } from '@/lib/api/rules'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { HumanAlert } from '@pathways/shared'
import Link from 'next/link'
import { manilaTime } from '../rules.utils'
import { EvidenceTable } from './evidence-table'
import { RuleTreeView } from './rule-tree-view'

export function AlertEvidence({ item }: { item: HumanAlert }) {
  const { profile } = useCurrentRole()
  const canReadLinked =
    principalHasAtomicPermission(profile, 'recommendations.read') &&
    item.linkedRecommendationIds.length > 0
  // One read labels each linked recommendation by its title instead of a number.
  const linked = useAuthorizedRead(
    `alert-linked-recommendations:${item.id}`,
    item.projectId,
    'recommendations.read',
    (signal) => rulesHumanClient.listRecommendations({ alertId: item.id, limit: '10' }, signal),
    canReadLinked,
    { freshness: 'summary' },
  )
  const titleOf = (id: string) => linked.data?.items.find((row) => row.id === id)?.title
  return (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap">{item.explanation}</p>
      <p className="text-sm text-muted-foreground">
        Rule evaluated at {manilaTime(item.evaluatedAt)}.
      </p>
      <RuleTreeView node={item.conditions} />
      <EvidenceTable evidence={item.evidence} />
      {canReadLinked ? (
        <ul className="space-y-2">
          {item.linkedRecommendationIds.map((id, index) => (
            <li key={id}>
              <Link className="text-primary underline" href={`/recommendations/${id}`}>
                {titleOf(id)
                  ? `Linked recommendation: ${titleOf(id)}`
                  : `View linked recommendation ${index + 1}`}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="font-semibold">Predefined recommendations</h3>
      <ul className="space-y-2">
        {item.predefinedRecommendations.map((recommendation) => (
          <li key={recommendation.id}>
            <strong>{recommendation.title}</strong>
            <p>{recommendation.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
