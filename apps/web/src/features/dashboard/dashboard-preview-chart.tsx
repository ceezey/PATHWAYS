'use client'

import ReactECharts from 'echarts-for-react'

export const DashboardPreviewChart = () => (
  <ReactECharts
    className="h-[320px] w-full"
    option={{
      animation: false,
      aria: {
        enabled: true,
        description:
          'Monthly dashboard preview values: January 14, February 22, March 18, April 31, May 28, and June 36.',
      },
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 12, right: 12, top: 18, bottom: 18, containLabel: true },
      xAxis: {
        type: 'category',
        data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        axisLine: { lineStyle: { color: '#D6DEE6' } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E9EEF2' } },
      },
      series: [
        {
          data: [14, 22, 18, 31, 28, 36],
          type: 'line',
          smooth: true,
          areaStyle: { opacity: 0.12 },
          lineStyle: { width: 3, color: '#0072CE' },
          itemStyle: { color: '#0072CE' },
        },
      ],
    }}
  />
)
