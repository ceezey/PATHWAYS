import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common'
import {
  type CreateProjectRequest,
  type UpdateProjectRequest,
  createProjectRequest,
  updateProjectRequest,
} from '@pathways/shared'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ProjectsService } from './projects.service'

@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('projects.read')
  list(@Req() request: AuthenticatedRequest) {
    return this.projects.list(requestIdentity(request))
  }

  @Get(':projectId')
  @RequirePermission('projects.detail.read')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.get(requestIdentity(request), projectId)
  }

  @Post()
  @RequirePermission('projects.create')
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(createProjectRequest)) body: CreateProjectRequest,
  ) {
    return this.projects.create(requestIdentity(request), body)
  }

  @Patch(':projectId')
  @RequirePermission('projects.update')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(updateProjectRequest)) body: UpdateProjectRequest,
  ) {
    return this.projects.update(requestIdentity(request), projectId, body)
  }

  @Post(':projectId/archive')
  @HttpCode(200)
  @RequirePermission('projects.archive')
  archive(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.archive(requestIdentity(request), projectId)
  }
}
