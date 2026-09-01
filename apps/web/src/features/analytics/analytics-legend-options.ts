type LegendViewport = 'desktop' | 'tablet' | 'mobile'

type LegendTooltipParameters = {
  name?: string
}

type LegendProfile = {
  fontSize: number
  itemGap: number
  itemHeight: number
  itemWidth: number
  labelLimit: number
  lineHeight: number
  itemsPerRow: number
}

const legendProfiles: Record<LegendViewport, LegendProfile> = {
  desktop: {
    fontSize: 12,
    itemGap: 12,
    itemHeight: 8,
    itemWidth: 14,
    labelLimit: 34,
    lineHeight: 16,
    itemsPerRow: 3,
  },
  tablet: {
    fontSize: 11,
    itemGap: 10,
    itemHeight: 8,
    itemWidth: 12,
    labelLimit: 28,
    lineHeight: 16,
    itemsPerRow: 2,
  },
  mobile: {
    fontSize: 10,
    itemGap: 8,
    itemHeight: 7,
    itemWidth: 10,
    labelLimit: 20,
    lineHeight: 14,
    itemsPerRow: 1,
  },
}

export const truncateLegendLabel = (label: string, limit: number) => {
  if (label.length <= limit) return label

  return `${label.slice(0, limit - 1).trimEnd()}\u2026`
}

export const formatLegendTooltip = ({ name }: LegendTooltipParameters) => name ?? ''

const createLegend = (viewport: LegendViewport) => {
  const profile = legendProfiles[viewport]

  return {
    top: 0,
    left: 'center',
    width: '96%',
    orient: 'horizontal' as const,
    itemGap: profile.itemGap,
    itemHeight: profile.itemHeight,
    itemWidth: profile.itemWidth,
    formatter: (name: string) => truncateLegendLabel(name, profile.labelLimit),
    textStyle: {
      fontSize: profile.fontSize,
      lineHeight: profile.lineHeight,
    },
    tooltip: {
      show: true,
      renderMode: 'richText' as const,
      formatter: formatLegendTooltip,
    },
  }
}

const createGrid = (labelCount: number, viewport: LegendViewport) => {
  const profile = legendProfiles[viewport]
  const rows = Math.max(1, Math.ceil(labelCount / profile.itemsPerRow))

  return {
    left: 16,
    right: 16,
    top: 30 + rows * profile.lineHeight,
    bottom: 18,
    containLabel: true,
  }
}

export const createAdaptiveLegendLayout = (labels: string[]) => ({
  legend: createLegend('desktop'),
  grid: createGrid(labels.length, 'desktop'),
  media: [
    {
      query: { minWidth: 421, maxWidth: 720 },
      option: {
        legend: createLegend('tablet'),
        grid: createGrid(labels.length, 'tablet'),
      },
    },
    {
      query: { maxWidth: 420 },
      option: {
        legend: createLegend('mobile'),
        grid: createGrid(labels.length, 'mobile'),
      },
    },
  ],
})

export const buildLegendAriaDescription = (description: string, labels: string[]) =>
  labels.length > 0 ? `${description} Full legend labels: ${labels.join('; ')}.` : description
