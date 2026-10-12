import { Module } from '@nestjs/common'

import { ActivitiesController } from './activities.controller'
import { ActivitiesService } from './activities.service'
import { EvidenceController } from './activity-evidence.controller'
import { MilestonesController } from './activity-milestones.controller'
import { ActivityProofsController } from './activity-proofs.controller'
import { ActivityUpdatesController } from './activity-updates.controller'
import { PrivateProofInspectionService } from './private-proof-inspection.service'

@Module({
  // The fixed GET segments of ActivitiesController register before any :activityId route.
  controllers: [
    ActivitiesController,
    ActivityUpdatesController,
    ActivityProofsController,
    MilestonesController,
    EvidenceController,
  ],
  providers: [ActivitiesService, PrivateProofInspectionService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
