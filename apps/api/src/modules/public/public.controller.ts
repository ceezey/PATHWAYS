import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { Public } from '../../common/decorators/public.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
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

@Controller('projects/:projectId/publication')
export class PublicationController {
  constructor(@Inject(PublicService) private readonly service: PublicService) {}
  private actor(request: AuthenticatedRequest) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return request.user
  }
  @Get()
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') id: string) {
    return this.service.get(this.actor(request), id)
  }
  @Post('submit')
  @RequirePermission('public.preview')
  @Header('Cache-Control', 'private, no-store')
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.transition(this.actor(request), id, 'SUBMIT', body)
  }
  @Post('approve')
  @RequirePermission('public.approve')
  @Header('Cache-Control', 'private, no-store')
  approve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.transition(this.actor(request), id, 'APPROVE', body)
  }
  @Post('publish')
  @RequirePermission('public.publish')
  @Header('Cache-Control', 'private, no-store')
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.transition(this.actor(request), id, 'PUBLISH', body)
  }
  @Post('withdraw')
  @RequirePermission('public.publish')
  @Header('Cache-Control', 'private, no-store')
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.transition(this.actor(request), id, 'WITHDRAW', body)
  }
}
