import { Module } from '@nestjs/common'

import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module'
import { ParticipantsModule } from '../participants/participants.module'
import { GuardianApprovalService } from './guardian-approval.service'
import { ImportReviewService } from './import-review.service'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

@Module({
  imports: [BeneficiariesModule, ParticipantsModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportReviewService, GuardianApprovalService],
})
export class ImportsModule {}
