'use client'

import ReactECharts from 'echarts-for-react'

import type { PublicProjectRecord } from '@/types/pathways'

const colors = ['#0072CE', '#0B2E4F', '#8A4B08', '#526779']
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
      color: colors,
      tooltip: { trigger: 'axis' },
      grid,
      xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
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
      color: ['#0072CE'],
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

export const PublicPortfolioChart = ({ projects }: { projects: PublicProjectRecord[] }) => (
  <ReactECharts
    className="h-[280px] w-full"
    option={{
      animation: false,
      aria: {
        enabled: true,
        description: 'Average selected-indicator progress across approved public projects.',
      },
      color: colors,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0 },
      grid,
      xAxis: { type: 'value', min: 0, max: 100 },
      yAxis: {
        type: 'category',
        data: projects.map((project) => project.title),
        axisLabel: {
          width: 170,
          overflow: 'break',
          lineHeight: 16,
        },
      },
      series: [
        {
          name: 'Average selected-indicator progress',
          type: 'bar',
          data: projects.map((project) =>
            Math.round(
              project.selectedIndicators.reduce(
                (total, indicator) => total + indicator.progress,
                0,
              ) / project.selectedIndicators.length,
            ),
          ),
        },
      ],
    }}
  />
)
