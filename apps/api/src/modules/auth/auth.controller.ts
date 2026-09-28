import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { AuthBoundary } from '../../common/decorators/auth-boundary.decorator'
import { AuthService } from './auth.service'
// biome-ignore lint/style/useImportType: Nest needs the DTO constructors for validation.
import { ChangeStepUpPinDto, VerifyStepUpPinDto } from './beneficiary-step-up-pin.dto'
import { BeneficiaryStepUpPinService, type StepUpPinActor } from './beneficiary-step-up-pin.service'
import type { AuthenticatedRequest } from './developer-access'
import { WorkspaceResolutionService } from './workspace-resolution.service'

// Identity, organization and session come only from the guard's verified values.
function pinActor(request: AuthenticatedRequest): StepUpPinActor {
  if (!request.auth || !request.user || !request.authSessionId) {
    throw new ForbiddenException('Verified profile required.')
  }
  return { auth: request.auth, profile: request.user, sessionId: request.authSessionId }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspaceResolutionService) private readonly workspaces: WorkspaceResolutionService,
    @Inject(BeneficiaryStepUpPinService) private readonly pins: BeneficiaryStepUpPinService,
  ) {}

  @Get('workspaces')
  @AuthBoundary('workspace-discovery')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    description: 'Zero or one current, database-verified workspace.',
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
      applicationAccessEnabled: true,
    }
  }

  @Get('step-up/status')
  @AuthBoundary('profile')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    description:
      'Beneficiary step-up freshness (signed TOTP or session-bound PIN grant) and PIN state; no business data.',
  })
  getStepUpStatus(@Req() request: AuthenticatedRequest) {
    return this.pins.status(pinActor(request))
  }

  // cr-pathways-beneficiary-step-up-pin. The PIN is accepted only in the JSON body.
  @Post('step-up/pin')
  @AuthBoundary('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Verify the PIN and grant 15 minutes for this session.' })
  verifyStepUpPin(@Req() request: AuthenticatedRequest, @Body() body: VerifyStepUpPinDto) {
    return this.pins.verify(pinActor(request), body.pin)
  }

  @Post('step-up/pin/setup')
  @AuthBoundary('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Set a first PIN inside a fresh TOTP step-up.' })
  setupStepUpPin(@Req() request: AuthenticatedRequest, @Body() body: VerifyStepUpPinDto) {
    return this.pins.setup(pinActor(request), body.pin)
  }

  @Post('step-up/pin/change')
  @AuthBoundary('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Change the PIN with the current PIN or a fresh TOTP.' })
  changeStepUpPin(@Req() request: AuthenticatedRequest, @Body() body: ChangeStepUpPinDto) {
    return this.pins.change(pinActor(request), body.newPin, body.currentPin)
  }

  @Post('step-up/pin/unlock')
  @AuthBoundary('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Unlock a locked PIN with a TOTP verified after the lock.' })
  unlockStepUpPin(@Req() request: AuthenticatedRequest) {
    return this.pins.unlock(pinActor(request))
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
