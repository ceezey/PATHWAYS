import { Controller, ForbiddenException, Get, Header, Inject, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { AuditService } from './audit.service'

@Controller('audit')
export class AuditController {
  constructor(@Inject(AuditService) private readonly service: AuditService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('audit.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.list(request.user, query)
  }
}
