import { Module } from '@nestjs/common'

import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module'
import { ParticipantsModule } from '../participants/participants.module'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

@Module({
  imports: [BeneficiariesModule, ParticipantsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
