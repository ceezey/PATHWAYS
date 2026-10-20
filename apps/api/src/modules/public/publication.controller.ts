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
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { PublicService } from './public.service'

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
    // Wrapped so "no publication yet" is sent as JSON; Nest sends a bare null as an empty body.
    return this.service.get(this.actor(request), id).then((publication) => ({ publication }))
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
