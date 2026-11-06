// Step-up denial code the api returns and the web listens for (cr-pathways-beneficiary-step-up).
export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'
// Shape of a PIN being verified, as in migration 0037 (cr-pathways-beneficiary-step-up-pin).
export const STEP_UP_PIN_PATTERN = /^[0-9]{6,12}$/
export const STEP_UP_PIN_RULE_MESSAGE =
  'Use 6 digits. Repeated digits and simple ascending or descending sequences are not accepted.'
export type StepUpPinState = 'NONE' | 'SET' | 'LOCKED'

/** A new PIN: 6 ASCII digits, rejecting all-identical digits and strictly ascending/descending runs. */
export function isAcceptableStepUpPin(candidate: unknown): candidate is string {
  if (typeof candidate !== 'string' || !/^[0-9]{6}$/.test(candidate)) return false
  const steps = [...candidate.slice(1)].map(
    (digit, index) => digit.charCodeAt(0) - candidate.charCodeAt(index),
  )
  return ![0, 1, -1].some((run) => steps.every((step) => step === run))
}
