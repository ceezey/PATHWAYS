'use client'

import type { HumanAlert } from '@pathways/shared'
import { comparisonCopy } from '../rules.copy'
import { codeLabel, formatMetricValue } from '../rules.utils'

export function EvidenceTable({ evidence }: { evidence: HumanAlert['evidence'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-semibold">Recorded evaluation evidence</caption>
        <thead>
          <tr>
            <th className="p-2" scope="col">
              Metric
            </th>
            <th className="p-2" scope="col">
              Observed value
            </th>
            <th className="p-2" scope="col">
              Condition
            </th>
            <th className="p-2" scope="col">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((evidence) => (
            <tr className="border-t border-border" key={evidence.conditionId}>
              <th className="p-2 font-normal" scope="row">
                {codeLabel(evidence.metric)}
              </th>
              <td className="p-2">
                {evidence.cell.value !== null
                  ? formatMetricValue(evidence.cell.value, evidence.unit)
                  : `${codeLabel(evidence.cell.state)}${evidence.cell.reason ? ` (${codeLabel(evidence.cell.reason)})` : ''}`}
              </td>
              <td className="p-2">
                {comparisonCopy[evidence.operator]}{' '}
                {formatMetricValue(evidence.threshold, evidence.unit)}
                {evidence.thresholdMaximum !== null
                  ? ` to ${formatMetricValue(evidence.thresholdMaximum, evidence.unit)}`
                  : ''}
              </td>
              <td className="p-2">{codeLabel(evidence.result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
