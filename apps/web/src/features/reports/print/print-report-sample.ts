import type { ReportSections } from '@/lib/services/report-sections'
import type { PrintReport } from './print-report-payload'

const figure = (label: string, value: string | null, percent: number | null, detail = '') => ({
  label,
  state: value === null ? 'SUPPRESSED' : 'AVAILABLE',
  value,
  reason: value === null ? 'SMALL_CELL' : null,
  detail,
  percent,
})
const milestone = (title: string, status: string, target: string, done: string | null) => ({
  title,
  status,
  targetDate: target,
  completionDate: done,
  overdue: done === null && target < '2026-10-05',
})

// Fictional fixture for checking the Project summary design locally with ?sample=project.
const sections: ReportSections = {
  reportDate: '2026-10-05',
  information: {
    code: 'SAMPLE-01',
    title: 'Sample community nutrition project',
    status: 'ACTIVE',
    sector: 'Health',
    area: 'Sample Province',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    manager: 'Ana Reyes',
    partners: 'Sample Partner Foundation',
  },
  overview: [
    { area: 'Schedule', status: 'AT_RISK', comment: '1 milestone(s) overdue.' },
    {
      area: 'Budget',
      status: 'ON_TRACK',
      comment: 'Budget used (58%) is in line with the timeline (76%).',
    },
    {
      area: 'Indicators',
      status: 'OFF_TRACK',
      comment: 'KPI achievement (35%) against timeline (76%).',
    },
  ],
  keyFigures: [
    figure('Timeline elapsed', '76%', 76),
    figure('Budget used', '58%', 58, 'Approved 500000.00; spent 290000.00'),
    figure('KPI achievement', '35%', 35),
    figure('Beneficiaries reached', null, null, 'Target 300'),
  ],
  milestones: [
    milestone('Baseline survey', 'COMPLETED', '2026-02-15', '2026-02-12'),
    milestone('Mid-year review', 'PENDING', '2026-09-30', null),
    milestone('Final report', 'PENDING', '2026-12-20', null),
  ],
  indicators: [
    {
      code: 'IND-01',
      name: 'Households trained',
      baseline: '0',
      target: '200',
      current: '70',
      progress: '35%',
    },
    {
      code: 'IND-02',
      name: 'Children screened',
      baseline: '0',
      target: '500',
      current: '175',
      progress: '35%',
    },
  ],
  alerts: [
    {
      title: 'Indicator behind schedule',
      severity: 'HIGH',
      explanation: 'Progress is well below the elapsed timeline.',
      evaluatedAt: '2026-10-04T08:00:00.000Z',
    },
  ],
}

export const sampleProjectReport: PrintReport = {
  title: 'Sample project status report',
  kind: 'PROJECT_SUMMARY',
  columns: ['Section', 'Item', 'Value', 'Detail'],
  rows: [['Project information', 'Code', 'SAMPLE-01', '']],
  sections,
  generatedAt: '2026-10-05T03:00:00.000Z',
  unavailableReasons: [],
}
