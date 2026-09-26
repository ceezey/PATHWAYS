import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import { AuthorizeExistingUserDto, UpdateAuthorizedUserDto } from './users.dto'
import { UsersService } from './users.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users.authorize')
  list(@Req() request: AuthenticatedRequest) {
    return this.users.list(profile(request))
  }

  @Post('authorize-existing')
  @RequirePermission('users.authorize')
  authorizeExisting(@Req() request: AuthenticatedRequest, @Body() body: AuthorizeExistingUserDto) {
    return this.users.authorizeExisting(profile(request), body)
  }

  @Patch(':userId')
  @RequirePermission('users.authorize')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: UpdateAuthorizedUserDto,
  ) {
    return this.users.update(profile(request), userId, body)
  }
}
