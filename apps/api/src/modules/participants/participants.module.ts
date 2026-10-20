import { Module } from '@nestjs/common'

import { BeneficiaryJourneyController } from './beneficiary-journey.controller'
import { BeneficiaryJourneyService } from './beneficiary-journey.service'
import { JourneyStagesController } from './journey-stages.controller'
import { JourneyStagesService } from './journey-stages.service'
import { ParticipantsService } from './participants.service'

@Module({
  controllers: [JourneyStagesController, BeneficiaryJourneyController],
  providers: [ParticipantsService, JourneyStagesService, BeneficiaryJourneyService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
