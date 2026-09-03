import { describe, expect, it } from 'vitest'

import { activityFormSchema, createActivityFormSchema } from './activity-form-validation'

describe('activity form validation', () => {
  it('requires activity setup fields', () => {
    const result = activityFormSchema.safeParse({
      title: '',
      description: '',
      startDate: '',
      dueDate: '',
      targetBeneficiaries: 0,
      budgetAllocation: 0,
      assignedOfficers: [],
      connectedIndicators: [],
      journeyStageId: '',
    })

    expect(result.success).toBe(false)
  })

  it('rejects a due date before the start date', () => {
    const result = activityFormSchema.safeParse({
      title: 'Prototype activity',
      description: 'A valid prototype activity description.',
      startDate: '2026-09-10',
      dueDate: '2026-09-01',
      targetBeneficiaries: 30,
      budgetAllocation: 10000,
      assignedOfficers: ['Project Officer A'],
      connectedIndicators: ['ind-fm-01'],
      journeyStageId: 'stage-entry',
    })

    expect(result.success).toBe(false)
  })

  it('rejects relationships outside the visible project-scoped options', () => {
    const schema = createActivityFormSchema({
      indicatorIds: ['ind-fm-01'],
      journeyStageIds: ['stage-entry'],
      officerNames: ['Project Officer A'],
    })
    const validInput = {
      title: 'Prototype activity',
      description: 'A valid prototype activity description.',
      startDate: '2026-09-01',
      dueDate: '2026-09-10',
      targetBeneficiaries: 30,
      budgetAllocation: 10000,
      assignedOfficers: ['Project Officer A'],
      connectedIndicators: ['ind-fm-01'],
      journeyStageId: 'stage-entry',
    }

    expect(schema.safeParse(validInput).success).toBe(true)
    expect(
      schema.safeParse({
        ...validInput,
        assignedOfficers: ['Project Officer Outside Scope'],
        connectedIndicators: ['ind-outside-scope'],
        journeyStageId: 'stage-outside-scope',
      }).success,
    ).toBe(false)
  })
})
