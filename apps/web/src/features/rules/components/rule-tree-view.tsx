'use client'

import type { RuleNode } from '@pathways/shared'
import { comparisonCopy } from '../rules.copy'
import { metricLabel, nodeKey } from '../rules.utils'

export function RuleTreeView({ node }: { node: RuleNode }) {
  return node.kind === 'GROUP' ? (
    <div className="space-y-2 border-l-2 border-border pl-3">
      <p className="font-medium">{node.mode === 'AND' ? 'All conditions' : 'Any condition'}</p>
      {node.children.map((child) => (
        <RuleTreeView key={nodeKey(child)} node={child} />
      ))}
    </div>
  ) : (
    <p className="text-sm">
      {metricLabel(node.metric)} {comparisonCopy[node.operator]} {node.threshold}
      {node.thresholdMaximum !== undefined ? ` to ${node.thresholdMaximum}` : ''}
    </p>
  )
}
