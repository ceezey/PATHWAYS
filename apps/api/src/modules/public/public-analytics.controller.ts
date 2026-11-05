import { Controller, Get, Header, Inject, Param } from '@nestjs/common'

import { Public } from '../../common/decorators/public.decorator'
import { PublicAnalyticsService } from './public-analytics.service'

@Controller('public/projects/:projectId/analytics')
export class PublicAnalyticsController {
  constructor(@Inject(PublicAnalyticsService) private readonly analytics: PublicAnalyticsService) {}

  @Get(':view')
  @Public()
  @Header('Cache-Control', 'no-store')
  get(@Param('projectId') projectId: string, @Param('view') view: string) {
    return this.analytics.read(projectId, view)
  }
}
