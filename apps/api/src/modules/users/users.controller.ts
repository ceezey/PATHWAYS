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

import {
  type AuthorizeExistingUserRequest,
  type UpdateAuthorizedUserRequest,
  authorizeExistingUserRequest,
  updateAuthorizedUserRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
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
  authorizeExisting(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(authorizeExistingUserRequest)) body: AuthorizeExistingUserRequest,
  ) {
    return this.users.authorizeExisting(profile(request), body)
  }

  @Patch(':userId')
  @RequirePermission('users.authorize')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body(new ZodPipe(updateAuthorizedUserRequest)) body: UpdateAuthorizedUserRequest,
  ) {
    return this.users.update(profile(request), userId, body)
  }
}
