'use client'

import { type DescriptiveAnalytics, formatMetricCell } from '@pathways/shared'

import { sectionLabels } from '../analytics.copy'
import { formatShare } from '../analytics.utils'

export const DescriptiveStatisticsTable = ({ data }: { data: DescriptiveAnalytics }) => (
  <div className="space-y-4 overflow-x-auto text-sm" data-testid="descriptive-statistics">
    <table className="w-full text-left">
      <caption className="sr-only">Descriptive counts</caption>
      <thead>
        <tr className="border-b">
          <th className="p-2">Measure</th>
          <th className="p-2">Count</th>
        </tr>
      </thead>
      <tbody>
        {data.counts.map((row) => (
          <tr className="border-b" key={row.key}>
            <td className="p-2">{row.label}</td>
            <td className="p-2 tabular-nums">{formatMetricCell(row.metric)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <table className="w-full text-left">
      <caption className="sr-only">Distributions</caption>
      <thead>
        <tr className="border-b">
          <th className="p-2">Dimension</th>
          <th className="p-2">Category</th>
          <th className="p-2">Count</th>
          <th className="p-2">Share</th>
        </tr>
      </thead>
      <tbody>
        {data.distributions.map((row) => (
          <tr className="border-b" key={`${row.section}-${row.key}`}>
            <td className="p-2">{sectionLabels[row.section]}</td>
            <td className="p-2">{row.label}</td>
            <td className="p-2 tabular-nums">{formatMetricCell(row.metric)}</td>
            <td className="p-2 tabular-nums">{formatShare(row.share)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {data.indicatorSummaries.length ? (
      <table className="w-full text-left">
        <caption className="sr-only">Indicator means by unit</caption>
        <thead>
          <tr className="border-b">
            <th className="p-2">Unit</th>
            <th className="p-2">Reported</th>
            <th className="p-2">Mean</th>
            <th className="p-2">Minimum</th>
            <th className="p-2">Maximum</th>
          </tr>
        </thead>
        <tbody>
          {data.indicatorSummaries.map((row) => (
            <tr className="border-b" key={`${row.unitLabel}-${row.numericKind}`}>
              <td className="p-2">{row.unitLabel ?? 'No unit'}</td>
              <td className="p-2 tabular-nums">
                {row.reportedCount}/{row.indicatorCount}
              </td>
              <td className="p-2 tabular-nums">{row.mean ?? 'None yet'}</td>
              <td className="p-2 tabular-nums">{row.minimum ?? 'None yet'}</td>
              <td className="p-2 tabular-nums">{row.maximum ?? 'None yet'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : null}
  </div>
)
