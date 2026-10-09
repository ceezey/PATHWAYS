import { describe, expect, it } from 'vitest'
import { STEP_UP_PIN_RULE_MESSAGE, isAcceptableStepUpPin } from './beneficiary-step-up'

describe('beneficiary step-up PIN rule', () => {
  it('accepts 6 to 12 digits that are not repeated or simple runs', () => {
    for (const pin of ['135790', '204682', '918273645012'])
      expect(isAcceptableStepUpPin(pin)).toBe(true)
  })

  it('rejects runs, repeats, wrong lengths, non-digits and non-strings', () => {
    for (const pin of [
      '111111',
      '123456',
      '654321',
      '12345',
      '1234567890123',
      ' 135790',
      '13579a',
      135790,
      null,
      undefined,
    ])
      expect(isAcceptableStepUpPin(pin)).toBe(false)
  })

  it('keeps the message both apps show', () => {
    expect(STEP_UP_PIN_RULE_MESSAGE).toBe(
      'Use 6 to 12 digits. Repeated digits and simple ascending or descending sequences are not accepted.',
    )
  })
})
