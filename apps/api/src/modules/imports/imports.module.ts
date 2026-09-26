import { Module } from '@nestjs/common'

import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module'
import { ParticipantsModule } from '../participants/participants.module'
import { StorageModule } from '../storage/storage.module'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

@Module({
  imports: [BeneficiariesModule, ParticipantsModule, StorageModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
