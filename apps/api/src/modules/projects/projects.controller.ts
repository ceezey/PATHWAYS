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

import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import { CreateProjectDto, UpdateProjectDto } from './projects.dto'
import { ProjectsService } from './projects.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('projects.read')
  list(@Req() request: AuthenticatedRequest) {
    return this.projects.list(profile(request))
  }

  @Get(':projectId')
  @RequirePermission('projects.read')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.get(profile(request), projectId)
  }

  @Post()
  @RequirePermission('projects.create')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateProjectDto) {
    return this.projects.create(profile(request), body)
  }

  @Patch(':projectId')
  @RequirePermission('projects.create')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projects.update(profile(request), projectId, body)
  }
}
