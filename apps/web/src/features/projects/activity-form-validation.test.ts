import { describe, expect, it } from 'vitest'

import { activityFormSchema } from './activity-form-validation'

describe('activity form validation', () => {
  it('requires activity setup fields', () => {
    const result = activityFormSchema.safeParse({
      title: '',
      description: '',
      startDate: '',
      dueDate: '',
      targetBeneficiaries: 0,
      budgetAllocation: 0,
      assignedOfficers: '',
      connectedIndicators: '',
      journeyStageId: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a due date before the start date', () => {
    const result = activityFormSchema.safeParse({
      title: 'Community workshop',
      description: 'A valid activity description for the selected project.',
      startDate: '2026-09-10',
      dueDate: '2026-09-01',
      targetBeneficiaries: 30,
      budgetAllocation: 10000,
      assignedOfficers: 'Project Officer A',
      connectedIndicators: 'ind-fm-01',
      journeyStageId: 'stage-entry',
    })

    expect(result.success).toBe(false)
  })
})
