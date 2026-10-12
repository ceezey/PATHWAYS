import { Controller, Get, Inject, Param, Req } from '@nestjs/common'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ActivitiesService } from './activities.service'

@Controller('projects/:projectId/evidence')
export class EvidenceController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermission('evidence.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.listEvidence(requestIdentity(request), projectId)
  }
}
