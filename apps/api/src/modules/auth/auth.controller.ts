import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'

import {
  type ChangeOwnPasswordRequest,
  type ChangeStepUpPinRequest,
  type PasswordRecoveryCompleteRequest,
  type SignInRequest,
  type VerifyStepUpPinRequest,
  changeOwnPasswordRequest,
  changeStepUpPinRequest,
  passwordRecoveryCompleteRequest,
  verifyStepUpPinRequest,
} from '@pathways/shared'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { AuthBoundary } from '../../common/decorators/auth-boundary.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { RateLimit } from '../../common/rate-limit/rate-limit.guard'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { AppSessionsService } from './app-sessions.service'
import { signInBody } from './auth.helpers'
import { AuthService } from './auth.service'
import { BeneficiaryStepUpPinService, type StepUpPinActor } from './beneficiary-step-up-pin.service'
import { OwnAccountService } from './own-account.service'
import { PasswordRecoveryService, bearerToken } from './password-recovery.service'
import { SignInLockoutService } from './signin-lockout.service'
import { WorkspaceResolutionService } from './workspace-resolution.service'

// Identity, organization and session come only from the guard's verified values.
function pinActor(request: AuthenticatedRequest): StepUpPinActor {
  if (!request.auth || !request.user || !request.authSessionId) {
    throw new ForbiddenException('Verified profile required.')
  }
  return { auth: request.auth, profile: request.user, sessionId: request.authSessionId }
}

// The verified request's own access token, for Supabase calls made on the caller's behalf.
function accessToken(request: AuthenticatedRequest): string {
  const header = request.headers.authorization
  const token = typeof header === 'string' ? bearerToken(header) : undefined
  if (!token) throw new UnauthorizedException('Invalid or expired authentication. Sign in again.')
  return token
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WorkspaceResolutionService) private readonly workspaces: WorkspaceResolutionService,
    @Inject(BeneficiaryStepUpPinService) private readonly pins: BeneficiaryStepUpPinService,
    @Inject(SignInLockoutService) private readonly signIns: SignInLockoutService,
    @Inject(PasswordRecoveryService) private readonly recovery: PasswordRecoveryService,
    @Inject(OwnAccountService) private readonly account: OwnAccountService,
    @Inject(AppSessionsService) private readonly sessions: AppSessionsService,
  ) {}

  @Post('sign-in')
  @Public()
  @RateLimit('sign-in')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    description:
      'Identity-provider session; 429 SIGN_IN_LOCKED after repeated failures, 429 RATE_LIMITED past the per-minute limits.',
  })
  signIn(
    @Body(new ZodPipe(signInBody)) body: SignInRequest,
    @Headers('user-agent') device: string | undefined,
  ) {
    return this.signIns.signIn(body.email, body.password, device, body.captchaToken)
  }

  @Post('password-recovery/complete')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    description: 'Sets the password of a recovery or invite session, then ends every session.',
  })
  completePasswordRecovery(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodPipe(passwordRecoveryCompleteRequest)) body: PasswordRecoveryCompleteRequest,
  ) {
    return this.recovery.complete(authorization, body.password)
  }

  @Post('sign-out')
  @AuthBoundary('profile')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiNoContentResponse({
    description:
      'Records the sign-out of the verified session; the browser then ends the Supabase session.',
  })
  recordSignOut(@Req() request: AuthenticatedRequest) {
    return this.account.recordSignOut(pinActor(request))
  }

  @Post('password/change')
  @AuthBoundary('profile')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiNoContentResponse({
    description:
      "Sets the caller's password after a fresh authenticator check; the password is never logged or echoed.",
  })
  changeOwnPassword(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(changeOwnPasswordRequest)) body: ChangeOwnPasswordRequest,
  ) {
    return this.account.changePassword(pinActor(request), body.password, accessToken(request))
  }

  @Get('sessions')
  @AuthBoundary('profile')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    description: "The caller's open sessions, newest first; device text and times only.",
  })
  listSessions(@Req() request: AuthenticatedRequest) {
    const actor = pinActor(request)
    return this.sessions.list(actor.auth.id, actor.sessionId)
  }

  @Post('sessions/activity')
  @AuthBoundary('profile')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiNoContentResponse({
    description: 'Heartbeat from an active browser; records the activity now.',
  })
  async recordActivity(@Req() request: AuthenticatedRequest) {
    const actor = pinActor(request)
    // Unthrottled, so the browser's idle clock never runs ahead of the server's.
    await this.sessions.touch(actor.auth.id, actor.sessionId, undefined, true)
  }

  @Post('sessions/end-others')
  @AuthBoundary('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Ends every session of the caller except this one.' })
  endOtherSessions(@Req() request: AuthenticatedRequest) {
    return this.account.endOtherSessions(pinActor(request), accessToken(request))
  }

  @Post('sessions/:sessionId/end')
  @AuthBoundary('profile')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiNoContentResponse({ description: "Ends one of the caller's own sessions." })
  endSession(@Req() request: AuthenticatedRequest, @Param('sessionId') sessionId: string) {
    return this.account.endSession(pinActor(request), sessionId)
  }

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
  verifyStepUpPin(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(verifyStepUpPinRequest)) body: VerifyStepUpPinRequest,
  ) {
    return this.pins.verify(pinActor(request), body.pin)
  }

  @Post('step-up/pin/setup')
  @AuthBoundary('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Set a first PIN inside a fresh TOTP step-up.' })
  setupStepUpPin(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(verifyStepUpPinRequest)) body: VerifyStepUpPinRequest,
  ) {
    return this.pins.setup(pinActor(request), body.pin)
  }

  @Post('step-up/pin/change')
  @AuthBoundary('profile')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ description: 'Change the PIN with the current PIN or a fresh TOTP.' })
  changeStepUpPin(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(changeStepUpPinRequest)) body: ChangeStepUpPinRequest,
  ) {
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
