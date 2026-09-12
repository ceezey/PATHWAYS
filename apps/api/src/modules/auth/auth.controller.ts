import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { AuthBoundary } from '../../common/decorators/auth-boundary.decorator'
import { AuthService } from './auth.service'
import { type AuthenticatedRequest, developerApplicationAccessEnabled } from './developer-access'
import { WorkspaceResolutionService } from './workspace-resolution.service'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspaceResolutionService) private readonly workspaces: WorkspaceResolutionService,
  ) {}

  @Get('workspaces')
  @AuthBoundary('workspace-discovery')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    description: 'Prototype-only: zero or one current, database-verified workspace.',
  })
  getWorkspaces(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    if (!request.auth) throw new UnauthorizedException('Verified authentication required.')
    if (
      Object.keys(query).length ||
      request.headers['x-pathways-organization-id'] !== undefined ||
      request.headers['x-pathways-user-id'] !== undefined
    ) {
      throw new BadRequestException('Workspace discovery does not accept context selectors.')
    }
    return this.workspaces.discover(request.auth)
  }

  @Get('mfa/status')
  @AuthBoundary('mfa-setup')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Authenticated MFA setup only; no business data.' })
  getMfaStatus(@Req() request: AuthenticatedRequest) {
    return {
      authUserId: request.auth?.id,
      aal: request.auth?.aal,
      enrollmentAllowed: true,
      applicationAccessEnabled: developerApplicationAccessEnabled(),
    }
  }

  @Get('status')
  @AuthBoundary('profile')
  @Header('Cache-Control', 'private, no-store')
  getStatus() {
    return this.authService.getStatus()
  }

  @Get('me')
  @AuthBoundary('profile')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'MFA-verified active database profile and scope.' })
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return { user: request.user }
  }
}
