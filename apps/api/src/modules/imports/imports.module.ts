import { Module } from '@nestjs/common'

import { BeneficiariesModule } from '@app/modules/beneficiaries/beneficiaries.module'
import { ParticipantsModule } from '@app/modules/participants/participants.module'
import { StorageModule } from '@app/modules/storage/storage.module'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

@Module({
  imports: [BeneficiariesModule, ParticipantsModule, StorageModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
