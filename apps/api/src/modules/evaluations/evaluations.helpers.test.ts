import { describe, expect, it } from 'vitest'
import { classifyScoreCommentary } from './evaluations.helpers'

describe('classifyScoreCommentary', () => {
  it.each([
    [null, 'BUDGET_EFFICIENCY'],
    [null, 'BENEFICIARY_REACH'],
    ['', 'BENEFICIARY_REACH'],
    ['  ', 'BUDGET_EFFICIENCY'],
  ])('treats blank commentary %j on %s as a manual score without a note', (text, type) => {
    expect(classifyScoreCommentary(text, type)).toMatchObject({ source: 'manual', note: null })
  })

  it('keeps evidence text computed', () => {
    expect(classifyScoreCommentary('Reach 82% of target', 'BENEFICIARY_REACH')).toMatchObject({
      source: 'computed',
      evidence: 'Reach 82% of target',
    })
  })
})
