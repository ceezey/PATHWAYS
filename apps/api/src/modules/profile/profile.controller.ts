import { Body, Controller, ForbiddenException, Get, Inject, Patch, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
// biome-ignore lint/style/useImportType: Nest needs the DTO constructor for validation.
import { UpdateOwnProfileDto } from './profile.dto'
import { ProfileService } from './profile.service'

function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Verified profile required.')
  return request.user
}

@Controller('profile')
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profiles: ProfileService) {}

  @Get()
  @RequirePermission('profile.manage')
  read(@Req() request: AuthenticatedRequest) {
    return this.profiles.read(actor(request))
  }

  @Patch()
  @RequirePermission('profile.manage')
  update(@Req() request: AuthenticatedRequest, @Body() body: UpdateOwnProfileDto) {
    return this.profiles.update(actor(request), body)
  }
}
