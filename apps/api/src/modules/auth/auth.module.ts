import { Module } from '@nestjs/common'

import { AuthController } from '@app/modules/auth/auth.controller'
import { AuthService } from '@app/modules/auth/auth.service'
import { ApplicationProfileService } from './application-profile.service'
import { AuthorizedDataController } from './authorized-data.controller'
import { AuthorizedDataService } from './authorized-data.service'
import { TokenAuthService } from './token-auth.service'

@Module({
  controllers: [AuthController, AuthorizedDataController],
  providers: [AuthService, ApplicationProfileService, TokenAuthService, AuthorizedDataService],
  exports: [AuthService, ApplicationProfileService, TokenAuthService],
})
export class AuthModule {}
