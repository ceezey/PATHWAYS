import { Module } from '@nestjs/common'

import { BeneficiariesController } from './beneficiaries.controller'
import { BeneficiariesService } from './beneficiaries.service'
import { BeneficiaryRegistrationService } from './beneficiary-registration.service'
import { IdentityReviewController } from './identity-review.controller'
import { IdentityReviewService } from './identity-review.service'

@Module({
  controllers: [IdentityReviewController, BeneficiariesController],
  providers: [BeneficiariesService, BeneficiaryRegistrationService, IdentityReviewService],
  exports: [BeneficiaryRegistrationService],
})
export class BeneficiariesModule {}
