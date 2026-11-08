import {
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import {
  type MapPinPlaceQuery,
  type SaveMapPinRequest,
  mapPinPlaceQuery,
  saveMapPinRequest,
} from '@pathways/shared'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ProjectMapPinsService } from './project-map-pins.service'

@Controller('projects/:projectId/map-pins')
export class ProjectMapPinsController {
  constructor(@Inject(ProjectMapPinsService) private readonly service: ProjectMapPinsService) {}

  @Put()
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.update')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(saveMapPinRequest)) body: SaveMapPinRequest,
  ) {
    return this.service.save(requestIdentity(request), projectId, body)
  }

  @Delete()
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.update')
  reset(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query(new ZodPipe(mapPinPlaceQuery)) query: MapPinPlaceQuery,
  ) {
    return this.service.reset(requestIdentity(request), projectId, query)
  }
}
