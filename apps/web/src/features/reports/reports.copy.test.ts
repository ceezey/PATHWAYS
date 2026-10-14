import { describe, expect, it } from 'vitest'
import { reportKindLabels } from './reports.copy'

describe('report kind labels', () => {
  it('lists the monitoring and evaluation report kinds with their labels', () => {
    expect(reportKindLabels.MONITORING_REPORT).toBe('Monitoring report')
    expect(reportKindLabels.EVALUATION_REPORT).toBe('Evaluation report')
  })
})
