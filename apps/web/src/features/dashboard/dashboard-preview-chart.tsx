'use client'

import ReactECharts from 'echarts-for-react'

export const DashboardPreviewChart = () => (
  <ReactECharts
    className="h-[320px] w-full"
    option={{
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 12, right: 12, top: 18, bottom: 18, containLabel: true },
      xAxis: {
        type: 'category',
        data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: [
        {
          data: [14, 22, 18, 31, 28, 36],
          type: 'line',
          smooth: true,
          areaStyle: { opacity: 0.12 },
          lineStyle: { width: 3, color: '#0f766e' },
          itemStyle: { color: '#0f766e' },
        },
      ],
    }}
  />
)
