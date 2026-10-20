import { Controller, Get, Header, Inject, Query, Req, Res, StreamableFile } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { AnalyticsService } from './analytics.service'

@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly service: AnalyticsService) {}

  @Get('descriptive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  descriptive(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.descriptive(requestIdentity(request), query)
  }

  @Get('descriptive/export/preview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.export')
  exportPreview(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.exportPreview(requestIdentity(request), query)
  }

  @Get('descriptive/export')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.export')
  async export(
    @Req() request: AuthenticatedRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ) {
    const result = await this.service.export(requestIdentity(request), query)
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(result.bytes)
  }
}
