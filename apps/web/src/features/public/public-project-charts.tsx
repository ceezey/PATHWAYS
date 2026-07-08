'use client'

import ReactECharts from 'echarts-for-react'

import type { PublicProjectRecord } from '@/types/pathways'

const colors = ['#0f766e', '#2563eb', '#f59e0b', '#64748b']
const grid = { left: 12, right: 16, top: 28, bottom: 18, containLabel: true }

export const PublicProgressTrendChart = ({ project }: { project: PublicProjectRecord }) => (
  <ReactECharts
    className="h-[260px] w-full"
    option={{
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
      color: ['#2563eb'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid,
      xAxis: { type: 'value', max: 100 },
      yAxis: {
        type: 'category',
        data: project.selectedIndicators.map((indicator) => indicator.label),
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
      color: colors,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0 },
      grid,
      xAxis: { type: 'category', data: projects.map((project) => project.title) },
      yAxis: { type: 'value', min: 0, max: 100 },
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
