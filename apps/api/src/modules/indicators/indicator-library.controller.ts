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
import { IndicatorLibraryService } from './indicator-library.service'

function identity(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
@Controller('indicator-library')
export class IndicatorLibraryController {
  constructor(@Inject(IndicatorLibraryService) private readonly service: IndicatorLibraryService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.library.read')
  list(@Req() request: AuthenticatedRequest) {
    return this.service.list(identity(request))
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.library.create')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(identity(request), body)
  }
  @Post(':entryId/archive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('indicators.library.archive')
  archive(@Req() request: AuthenticatedRequest, @Param('entryId') entryId: string) {
    return this.service.archive(identity(request), entryId)
  }
}
