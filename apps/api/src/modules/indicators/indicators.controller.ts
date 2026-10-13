import { Body, Controller, Get, Header, Inject, Param, Patch, Post, Req } from '@nestjs/common'
import { archiveIndicatorRequest } from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { IndicatorLibraryService } from './indicator-library.service'
import { IndicatorMeasurementsService } from './indicator-measurements.service'
import { parseIndicatorRequest } from './indicators.helpers'
import { IndicatorsService } from './indicators.service'
@Controller('projects/:projectId/indicators')
export class IndicatorsController {
  constructor(
    @Inject(IndicatorsService) private readonly service: IndicatorsService,
    @Inject(IndicatorLibraryService) private readonly library: IndicatorLibraryService,
    @Inject(IndicatorMeasurementsService)
    private readonly measurements: IndicatorMeasurementsService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.service.list(requestIdentity(request), projectId)
  }
  @Get(':indicatorId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('indicatorId') indicatorId: string,
  ) {
    return this.service.get(requestIdentity(request), projectId, indicatorId)
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.create')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.service.create(requestIdentity(request), projectId, body)
  }
  @Post('from-library')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.create')
  createFromLibrary(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.library.createProjectIndicator(requestIdentity(request), projectId, body)
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
    return this.service.update(requestIdentity(request), projectId, indicatorId, body)
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
    return this.measurements.measure(requestIdentity(request), projectId, indicatorId, body)
  }
  @Post(':indicatorId/archive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.archive')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('indicatorId') indicatorId: string,
    @Body() body: unknown,
  ) {
    const input = parseIndicatorRequest(archiveIndicatorRequest, body)
    return this.service.archive(requestIdentity(request), projectId, indicatorId, input)
  }
}
