import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { RulesHumanService } from './rules-human.service'

@Controller('rules')
export class RulesController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listRules(requestIdentity(request), query)
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.create')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.createRule(requestIdentity(request), body)
  }
  @Post('dry-run')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  dryRun(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.dryRun(requestIdentity(request), body)
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getRule(requestIdentity(request), id)
  }
  @Post(':id/drafts')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.update')
  draft(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.draftRule(requestIdentity(request), id, body)
  }
  @Post(':id/activate')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.activate')
  activate(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.activateRule(requestIdentity(request), id, body)
  }
  @Post(':id/archive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.update')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archiveRule(requestIdentity(request), id, body)
  }
}
