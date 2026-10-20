import { Body, Controller, Get, Header, Inject, Param, Post, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { IndicatorLibraryService } from './indicator-library.service'

@Controller('indicator-library')
export class IndicatorLibraryController {
  constructor(@Inject(IndicatorLibraryService) private readonly service: IndicatorLibraryService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.library.read')
  list(@Req() request: AuthenticatedRequest) {
    return this.service.list(requestIdentity(request))
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.library.create')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(requestIdentity(request), body)
  }
  @Post(':entryId/archive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.library.archive')
  archive(@Req() request: AuthenticatedRequest, @Param('entryId') entryId: string) {
    return this.service.archive(requestIdentity(request), entryId)
  }
}
