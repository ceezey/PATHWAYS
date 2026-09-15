import { Module } from '@nestjs/common'

import { BeneficiaryJourneyController, JourneyStagesController } from './participants.controller'
import { ParticipantsService } from './participants.service'

@Module({
  controllers: [JourneyStagesController, BeneficiaryJourneyController],
  providers: [ParticipantsService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
