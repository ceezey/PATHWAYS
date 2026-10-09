import { Controller, Get, Header, Inject, Query, Req } from '@nestjs/common'
import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { AuthBoundary } from '../../common/decorators/auth-boundary.decorator'
import { RouteAccessService } from './route-access.service'

@Controller('access')
export class RouteAccessController {
  constructor(@Inject(RouteAccessService) private readonly routes: RouteAccessService) {}

  @Get('route-check')
  @AuthBoundary('profile')
  @Header('Cache-Control', 'private, no-store')
  check(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.routes.check(request.user as ApplicationIdentity, query)
  }
}
