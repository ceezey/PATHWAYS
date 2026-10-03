import { Module } from '@nestjs/common'

import { BeneficiaryMediaController } from './beneficiary-media.controller'
import { BeneficiaryMediaService } from './beneficiary-media.service'

@Module({
  controllers: [BeneficiaryMediaController],
  providers: [BeneficiaryMediaService],
})
export class BeneficiaryMediaModule {}
