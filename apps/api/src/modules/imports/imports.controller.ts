import {
  Body,
  Controller,
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

import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports'
import {
  type AutomaticImportMappingRequest,
  type ImportRowsQuery,
  type ProcessImportRequest,
  type RerunImportRequest,
  type ResolveImportRowRequest,
  type SaveImportMappingRequest,
  type UploadImportRequest,
  type ValidateImportRequest,
  automaticImportMappingRequest,
  importRowsQuery,
  processImportRequest,
  rerunImportRequest,
  resolveImportRowRequest,
  saveImportMappingRequest,
  uploadImportRequest,
  validateImportRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ImportReviewService } from './import-review.service'
import { ImportsService, type UploadedImportFile } from './imports.service'

@Controller('imports/projects/:projectId/batches')
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly imports: ImportsService,
    @Inject(ImportReviewService) private readonly review: ImportReviewService,
  ) {}

  @Get()
  @RequirePermission('imports.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.imports.listBatches(requestIdentity(request), projectId)
  }

  @Post('upload')
  @RequirePermission('imports.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: IMPORT_ENGINEERING_LIMITS.maxBytes,
        files: 1,
        fields: 3,
        fieldNameSize: 64,
        // A 100-character sheet name can take 400 bytes in UTF-8.
        fieldSize: 512,
        parts: 5,
      },
    }),
  )
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(uploadImportRequest)) body: UploadImportRequest,
    @UploadedFile() file?: UploadedImportFile,
  ) {
    return this.imports.upload(requestIdentity(request), projectId, body, file)
  }

  @Get(':batchId')
  @RequirePermission('imports.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.imports.getBatch(requestIdentity(request), projectId, batchId)
  }

  @Post(':batchId/resume')
  @RequirePermission('imports.upload')
  resume(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.imports.resumeUpload(requestIdentity(request), projectId, batchId)
  }

  @Post(':batchId/rerun')
  @RequirePermission('imports.upload')
  rerun(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(rerunImportRequest)) body: RerunImportRequest,
  ) {
    return this.imports.rerun(requestIdentity(request), projectId, batchId, body)
  }

  @Get(':batchId/rows')
  @RequirePermission('imports.read')
  rows(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Query(new ZodPipe(importRowsQuery)) query: ImportRowsQuery,
  ) {
    return this.imports.listRows(requestIdentity(request), projectId, batchId, query)
  }

  @Get(':batchId/rows/:rowId/review')
  @RequirePermission('imports.review')
  reviewRow(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Param('rowId') rowId: string,
  ) {
    return this.review.review(requestIdentity(request), projectId, batchId, rowId)
  }

  @Post(':batchId/rows/:rowId/resolve')
  @RequirePermission('imports.review')
  resolveRow(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Param('rowId') rowId: string,
    @Body(new ZodPipe(resolveImportRowRequest)) body: ResolveImportRowRequest,
  ) {
    return this.review.resolve(requestIdentity(request), projectId, batchId, rowId, body)
  }

  @Post(':batchId/automatic-mapping')
  @RequirePermission('imports.upload')
  automaticMapping(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(automaticImportMappingRequest)) body: AutomaticImportMappingRequest,
  ) {
    return this.imports.automaticMapping(requestIdentity(request), projectId, batchId, body)
  }

  @Patch(':batchId/mapping')
  @RequirePermission('imports.review')
  map(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(saveImportMappingRequest)) body: SaveImportMappingRequest,
  ) {
    return this.imports.saveMapping(requestIdentity(request), projectId, batchId, body)
  }

  @Post(':batchId/validate')
  @RequirePermission('imports.validate')
  validate(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(validateImportRequest)) body: ValidateImportRequest,
  ) {
    return this.imports.validate(requestIdentity(request), projectId, batchId, body)
  }

  @Post(':batchId/process')
  @RequirePermission('imports.process')
  process(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(processImportRequest)) body: ProcessImportRequest,
  ) {
    return this.imports.process(requestIdentity(request), projectId, batchId, body)
  }
}
