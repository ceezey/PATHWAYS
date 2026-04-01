import { Controller, Get, Inject, Req } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import type { AppRole } from '@pathways/shared'

import { AuthService } from '@app/modules/auth/auth.service'

interface AuthRequest {
  user?: {
    token?: string
    roles?: AppRole[]
  }
  authPlaceholder?: string
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get('status')
  @ApiOkResponse({ description: 'Authentication scaffold status.' })
  getStatus() {
    return this.authService.getStatus()
  }

  @Get('me')
  @ApiOkResponse({ description: 'Current request auth placeholder.' })
  getCurrentUser(@Req() request: AuthRequest) {
    return {
      user: request.user ?? null,
      placeholder: request.authPlaceholder ?? null,
    }
  }
}
