import { Body, Controller, ForbiddenException, Get, Inject, Post, Req } from '@nestjs/common'

import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructor at runtime.
import { CreateProgramDto } from './programs.dto'
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
  @RequirePermission('projects.create')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateProgramDto) {
    return this.programs.create(profile(request), body)
  }
}
