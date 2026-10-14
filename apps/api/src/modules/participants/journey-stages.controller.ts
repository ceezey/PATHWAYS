import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common'

import { type SaveJourneyStagesRequest, saveJourneyStagesRequest } from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { JourneyStagesService } from './journey-stages.service'

@Controller('projects/:projectId/journey-stages')
export class JourneyStagesController {
  constructor(@Inject(JourneyStagesService) private readonly stages: JourneyStagesService) {}
  // Project-level configuration read: Admin holds journeys.manage only.
  @Get()
  @RequirePermission('journeys.read', 'journeys.manage')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.stages.listStages(requestIdentity(request), projectId)
  }
  @Put()
  @RequirePermission('journeys.manage')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(saveJourneyStagesRequest)) body: SaveJourneyStagesRequest,
  ) {
    return this.stages.saveStages(requestIdentity(request), projectId, body)
  }
}
