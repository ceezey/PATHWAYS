import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { AnalyticsService } from './analytics.service'

function identity(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly service: AnalyticsService) {}

  @Get('descriptive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  descriptive(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.descriptive(identity(request), query)
  }

  @Get('descriptive/export/preview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.export')
  exportPreview(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.exportPreview(identity(request), query)
  }

  @Get('descriptive/export')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.export')
  async export(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ) {
    const result = await this.service.export(identity(request), query)
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(result.bytes)
  }
}
