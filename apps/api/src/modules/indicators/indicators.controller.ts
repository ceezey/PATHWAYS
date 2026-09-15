import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import { archiveIndicatorSchema, parseIndicatorInput } from './indicators.dto'
import { IndicatorsService } from './indicators.service'
function identity(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
@Controller('projects/:projectId/indicators')
export class IndicatorsController {
  constructor(@Inject(IndicatorsService) private readonly service: IndicatorsService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.service.list(identity(request), projectId)
  }
  @Get(':indicatorId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('indicatorId') indicatorId: string,
  ) {
    return this.service.get(identity(request), projectId, indicatorId)
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.create')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.service.create(identity(request), projectId, body)
  }
  @Patch(':indicatorId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.update')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('indicatorId') indicatorId: string,
    @Body() body: unknown,
  ) {
    return this.service.update(identity(request), projectId, indicatorId, body)
  }
  @Post(':indicatorId/measurements')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.update')
  measure(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('indicatorId') indicatorId: string,
    @Body() body: unknown,
  ) {
    return this.service.measure(identity(request), projectId, indicatorId, body)
  }
  @Post(':indicatorId/archive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.update')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('indicatorId') indicatorId: string,
    @Body() body: unknown,
  ) {
    const input = parseIndicatorInput(archiveIndicatorSchema, body)
    return this.service.archive(identity(request), projectId, indicatorId, input.expectedRevision)
  }
}
