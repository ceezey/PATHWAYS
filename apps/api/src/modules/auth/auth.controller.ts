import { Controller, Get, Header, Inject, Req } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { AuthBoundary } from '../../common/decorators/auth-boundary.decorator'
import { AuthService } from './auth.service'
import { type AuthenticatedRequest, developerApplicationAccessEnabled } from './developer-access'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get('mfa/status')
  @AuthBoundary('mfa-setup')
  @Header('Cache-Control', 'no-store')
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
  @Header('Cache-Control', 'no-store')
  getStatus() {
    return this.authService.getStatus()
  }

  @Get('me')
  @AuthBoundary('profile')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ description: 'MFA-verified active database profile and scope.' })
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return { user: request.user }
  }
}
