// Signal only: the API decides step-up freshness on every request.
export const STEP_UP_REQUIRED_EVENT = 'pathways:beneficiary-step-up-required'
export const STEP_UP_REQUIRED_CODE = 'STEP_UP_REQUIRED'

export function announceStepUpRequired() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(STEP_UP_REQUIRED_EVENT))
  }
}
