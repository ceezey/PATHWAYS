import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import {
  DecideActivityExtensionDto,
  RequestActivityExtensionDto,
  VerifyActivityExtensionDto,
} from './activity-extensions.dto'
import { ActivityExtensionsService } from './activity-extensions.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('projects/:projectId/activities/:activityId/extension-requests')
export class ActivityExtensionsController {
  constructor(
    @Inject(ActivityExtensionsService) private readonly service: ActivityExtensionsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.read')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.service.list(profile(request), projectId, activityId)
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.proof.submit')
  request(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body() body: RequestActivityExtensionDto,
  ) {
    return this.service.request(profile(request), projectId, activityId, body)
  }

  @Post(':requestId/verify')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evidence.review')
  verify(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('requestId') requestId: string,
    @Body() body: VerifyActivityExtensionDto,
  ) {
    return this.service.verify(profile(request), projectId, activityId, requestId, body)
  }

  @Post(':requestId/decide')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.update')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('requestId') requestId: string,
    @Body() body: DecideActivityExtensionDto,
  ) {
    return this.service.decide(profile(request), projectId, activityId, requestId, body)
  }
}
