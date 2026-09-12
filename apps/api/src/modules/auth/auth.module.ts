import { Module } from '@nestjs/common'

import { AuthController } from '@app/modules/auth/auth.controller'
import { AuthService } from '@app/modules/auth/auth.service'
import { ApplicationProfileService } from './application-profile.service'
import { AuthorizedDataController } from './authorized-data.controller'
import { AuthorizedDataService } from './authorized-data.service'
import { RouteAccessController } from './route-access.controller'
import { RouteAccessService } from './route-access.service'
import { SessionLivenessService } from './session-liveness.service'
import { TokenAuthService } from './token-auth.service'
import { WorkspaceResolutionService } from './workspace-resolution.service'

@Module({
  controllers: [AuthController, AuthorizedDataController, RouteAccessController],
  providers: [
    AuthService,
    ApplicationProfileService,
    TokenAuthService,
    SessionLivenessService,
    AuthorizedDataService,
    WorkspaceResolutionService,
    RouteAccessService,
  ],
  exports: [AuthService, ApplicationProfileService, TokenAuthService, WorkspaceResolutionService],
})
export class AuthModule {}
