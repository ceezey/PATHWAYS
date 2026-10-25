import { Module } from '@nestjs/common'

import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module'
import { ParticipantsModule } from '../participants/participants.module'
import { ImportReviewService } from './import-review.service'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

@Module({
  imports: [BeneficiariesModule, ParticipantsModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportReviewService],
})
export class ImportsModule {}
