import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { numericMetric } from '@pathways/shared'
import { aggregateAccessibleText, aggregateChartOption } from './aggregate-chart-options'
import { SadddChart } from './analytics-charts'

vi.mock('echarts-for-react', () => ({ default: () => null }))

describe('P06 server-produced chart values', () => {
  const buckets = [
    { key: '0-9', label: '0-9', metric: numericMetric('5') },
    { key: 'Unknown', label: 'Unknown', metric: { state: 'SUPPRESSED' as const, value: null, reason: 'COMPLEMENTARY_SUPPRESSION' } },
    { key: 'custom', label: 'Server-provided category', metric: { state: 'MISSING' as const, value: null, reason: 'RELEASE_POLICY_REVIEW_REQUIRED' } },
    { key: 'recorded-zero', label: 'Recorded zero', metric: numericMetric('0') },
  ]
  it('uses API category labels, including 0-9 and Unknown, without rebuilding age bands', () => {
    expect(aggregateChartOption(buckets, 'Age').xAxis.data).toEqual(['0-9', 'Unknown', 'Server-provided category', 'Recorded zero'])
  })
  it('does not convert missing/suppressed cells into numeric zero', () => {
    expect(aggregateChartOption(buckets, 'Age').series[0].data).toEqual([5, null, null, 0])
    expect(aggregateAccessibleText(buckets)).toContain('Unknown: Suppressed')
  })
  it('keeps exact decimal text separate from floating-point plotting values', () => {
    const exact = [{ key: 'ratio', label: 'Ratio', metric: numericMetric('99999999999999.9999') }]
    expect(aggregateAccessibleText(exact)).toBe('Ratio: 99999999999999.9999')
  })
  it('renders a truthful table, not a zero-valued chart, when no values may be released', () => {
    const html = renderToStaticMarkup(createElement(SadddChart, { label: 'Age', buckets: buckets.slice(1, 3) }))
    expect(html).toContain('No releasable values for this view.')
    expect(html).toContain('Unknown')
    expect(html).toContain('Suppressed')
    expect(html).toContain('Not available')
    expect(html).not.toContain('>0<')
  })
})
