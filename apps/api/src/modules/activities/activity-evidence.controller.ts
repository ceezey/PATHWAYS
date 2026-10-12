import { Controller, Get, Inject, Param, Req } from '@nestjs/common'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ActivityEvidenceService } from './activity-evidence.service'

@Controller('projects/:projectId/evidence')
export class EvidenceController {
  constructor(
    @Inject(ActivityEvidenceService) private readonly evidence: ActivityEvidenceService,
  ) {}

  @Get()
  @RequirePermission('evidence.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.evidence.listEvidence(requestIdentity(request), projectId)
  }
}
