import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { PublicService } from './public.service'

@Controller('public/projects')
export class PublicProjectsController {
  constructor(@Inject(PublicService) private readonly service: PublicService) {}
  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  list(@Query('offset') offset = '0', @Query('limit') limit = '50') {
    return this.service.published(undefined, Number(offset), Number(limit))
  }
  @Get(':projectId')
  @Public()
  @Header('Cache-Control', 'no-store')
  get(@Param('projectId') projectId: string) {
    return this.service.published(projectId)
  }
}
