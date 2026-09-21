import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'

import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import {
  ImportRowsQueryDto,
  ProcessImportDto,
  SaveImportMappingDto,
  UploadImportDto,
  ValidateImportDto,
} from './imports.dto'
import { ImportsService, type UploadedImportFile } from './imports.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('imports/projects/:projectId/batches')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly imports: ImportsService) {}

  @Get()
  @RequirePermission('imports.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.imports.listBatches(profile(request), projectId)
  }

  @Post('upload')
  @RequirePermission('imports.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: IMPORT_ENGINEERING_LIMITS.maxBytes,
        files: 1,
        fields: 2,
        fieldNameSize: 64,
        fieldSize: 256,
        parts: 4,
      },
    }),
  )
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: UploadImportDto,
    @UploadedFile() file?: UploadedImportFile,
  ) {
    return this.imports.upload(profile(request), projectId, body, file)
  }

  @Get(':batchId')
  @RequirePermission('imports.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.imports.getBatch(profile(request), projectId, batchId)
  }

  @Post(':batchId/resume')
  @RequirePermission('imports.upload')
  resume(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.imports.resumeUpload(profile(request), projectId, batchId)
  }

  @Get(':batchId/rows')
  @RequirePermission('imports.read')
  rows(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Query() query: ImportRowsQueryDto,
  ) {
    return this.imports.listRows(profile(request), projectId, batchId, query)
  }

  @Patch(':batchId/mapping')
  @RequirePermission('imports.review')
  map(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body() body: SaveImportMappingDto,
  ) {
    return this.imports.saveMapping(profile(request), projectId, batchId, body)
  }

  @Post(':batchId/validate')
  @RequirePermission('imports.review')
  validate(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body() body: ValidateImportDto,
  ) {
    return this.imports.validate(profile(request), projectId, batchId, body)
  }

  @Post(':batchId/process')
  @RequirePermission('imports.process')
  process(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body() body: ProcessImportDto,
  ) {
    return this.imports.process(profile(request), projectId, batchId, body)
  }
}
