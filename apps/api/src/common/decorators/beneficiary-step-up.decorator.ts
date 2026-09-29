import { SetMetadata } from '@nestjs/common'

export const BENEFICIARY_STEP_UP_KEY = 'pathways:beneficiary-step-up'
/** Beneficiary identifying-detail handlers; enforced after permission, before any query. */
export const RequireBeneficiaryStepUp = () => SetMetadata(BENEFICIARY_STEP_UP_KEY, true)
