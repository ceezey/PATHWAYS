import { Module } from '@nestjs/common'

import { ActivitiesController } from './activities.controller'
import { ActivitiesService } from './activities.service'
import { EvidenceController } from './activity-evidence.controller'
import { ActivityEvidenceService } from './activity-evidence.service'
import { MilestonesController } from './activity-milestones.controller'
import { ActivityMilestonesService } from './activity-milestones.service'
import { ActivityProgressService } from './activity-progress.service'
import { ActivityProofsController } from './activity-proofs.controller'
import { ActivityReviewService } from './activity-review.service'
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
  providers: [
    ActivitiesService,
    ActivityEvidenceService,
    ActivityMilestonesService,
    ActivityProgressService,
    ActivityReviewService,
    PrivateProofInspectionService,
  ],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
