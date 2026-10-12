import { Body, Controller, ForbiddenException, Get, Inject, Post, Req } from '@nestjs/common'

import { type CreateProgramRequest, createProgramRequest } from '@pathways/shared'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ProgramsService } from './programs.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('programs')
export class ProgramsController {
  constructor(@Inject(ProgramsService) private readonly programs: ProgramsService) {}

  @Get()
  @RequirePermission('projects.read')
  list(@Req() request: AuthenticatedRequest) {
    return this.programs.list(profile(request))
  }

  @Post()
  @RequirePermission('programs.create')
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(createProgramRequest)) body: CreateProgramRequest,
  ) {
    return this.programs.create(profile(request), body)
  }
}
