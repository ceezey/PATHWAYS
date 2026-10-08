'use client'

import { chartPalette } from '@/lib/chart-palette'
import ReactECharts from 'echarts-for-react'

import type { PublicProjectRecord } from '@/types/pathways'

const grid = { left: 12, right: 16, top: 28, bottom: 18, containLabel: true }

export const PublicProgressTrendChart = ({ project }: { project: PublicProjectRecord }) => (
  <ReactECharts
    className="h-[260px] w-full"
    option={{
      animation: false,
      aria: {
        enabled: true,
        description: `Approved progress trend for ${project.title}.`,
      },
      color: chartPalette,
      tooltip: { trigger: 'axis' },
      grid,
      xAxis: {
        type: 'category',
        data: project.progressTrend.map((_, index) => `Update ${index + 1}`),
      },
      yAxis: { type: 'value', min: 0, max: 100 },
      series: [
        {
          name: 'Approved progress',
          type: 'line',
          smooth: true,
          areaStyle: { opacity: 0.1 },
          data: project.progressTrend,
        },
      ],
    }}
  />
)

export const PublicIndicatorChart = ({ project }: { project: PublicProjectRecord }) => (
  <ReactECharts
    className="h-[260px] w-full"
    option={{
      animation: false,
      aria: {
        enabled: true,
        description: `Selected public indicator progress for ${project.title}.`,
      },
      color: [chartPalette[0]],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid,
      xAxis: { type: 'value', max: 100 },
      yAxis: {
        type: 'category',
        data: project.selectedIndicators.map((indicator) => indicator.label),
        axisLabel: {
          width: 120,
          overflow: 'truncate',
          ellipsis: '…',
        },
      },
      series: [
        {
          name: 'Progress',
          type: 'bar',
          data: project.selectedIndicators.map((indicator) => indicator.progress),
        },
      ],
    }}
  />
)
