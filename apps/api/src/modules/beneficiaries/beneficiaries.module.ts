import { Module } from '@nestjs/common'

import { BeneficiariesController } from './beneficiaries.controller'
import { BeneficiariesService } from './beneficiaries.service'

@Module({
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
