import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common'

import { type CreateProgramRequest, createProgramRequest } from '@pathways/shared'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ProgramsService } from './programs.service'

@Controller('programs')
export class ProgramsController {
  constructor(@Inject(ProgramsService) private readonly programs: ProgramsService) {}

  @Get()
  @RequirePermission('projects.read')
  list(@Req() request: AuthenticatedRequest) {
    return this.programs.list(requestIdentity(request))
  }

  @Post()
  @RequirePermission('programs.create')
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(createProgramRequest)) body: CreateProgramRequest,
  ) {
    return this.programs.create(requestIdentity(request), body)
  }
}
