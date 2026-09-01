import { describe, expect, it } from 'vitest'

import {
  buildLegendAriaDescription,
  createAdaptiveLegendLayout,
  formatLegendTooltip,
  truncateLegendLabel,
} from './analytics-legend-options'

describe('analytics legend options', () => {
  it('keeps readable labels and truncates only excessive labels', () => {
    expect(truncateLegendLabel('FutureMakers NCR', 20)).toBe('FutureMakers NCR')
    expect(truncateLegendLabel('Grassroots Centers - Navotas', 20)).toBe('Grassroots Centers\u2026')
  })

  it('adapts typography, wrapping space, and label length to chart width', () => {
    const labels = [
      'FutureMakers NCR',
      'Youth RISE - Western Samar',
      'Grassroots Centers - Navotas',
      'Girls Lead - Metro Manila',
    ]
    const layout = createAdaptiveLegendLayout(labels)
    const tablet = layout.media[0].option
    const mobile = layout.media[1].option

    expect(layout.legend.width).toBe('96%')
    expect(layout.legend.textStyle.fontSize).toBeGreaterThan(mobile.legend.textStyle.fontSize)
    expect(tablet.grid.top).toBeGreaterThanOrEqual(layout.grid.top)
    expect(mobile.grid.top).toBeGreaterThan(tablet.grid.top)
    expect(layout.legend.formatter(labels[2])).toBe(labels[2])
    expect(mobile.legend.formatter(labels[2])).toBe('Grassroots Centers\u2026')
  })

  it('keeps full labels available to hover and accessibility text', () => {
    const fullLabel = 'Grassroots Centers - Navotas'

    expect(formatLegendTooltip({ name: fullLabel })).toBe(fullLabel)
    expect(buildLegendAriaDescription('Project performance.', [fullLabel])).toBe(
      `Project performance. Full legend labels: ${fullLabel}.`,
    )
  })
})
