import { Module } from '@nestjs/common'

import {
  ActivitiesController,
  EvidenceController,
  MilestonesController,
} from './activities.controller'
import { ActivitiesService } from './activities.service'
import { PrivateProofInspectionService } from './private-proof-inspection.service'

@Module({
  controllers: [ActivitiesController, EvidenceController, MilestonesController],
  providers: [ActivitiesService, PrivateProofInspectionService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
