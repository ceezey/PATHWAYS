import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { ReportsService } from './reports.service'
function actor(req: AuthenticatedRequest) {
  if (!req.user) throw new ForbiddenException('Application profile required.')
  return req.user
}
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly service: ReportsService) {}
  @Get('preview')
  @RequirePermission('reports.read')
  @Header('Cache-Control', 'private, no-store')
  preview(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Query() query: unknown,
  ) {
    return this.service.preview(actor(req), id, query)
  }
  @Get()
  @RequirePermission('reports.read')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest, @Param('projectId') id: string) {
    return this.service.list(actor(req), id)
  }
  @Get('survey-forms')
  @RequirePermission('reports.read')
  @Header('Cache-Control', 'private, no-store')
  surveyForms(@Req() req: AuthenticatedRequest, @Param('projectId') id: string) {
    return this.service.surveyForms(actor(req), id)
  }
  @Post()
  @RequirePermission('reports.generate')
  @Header('Cache-Control', 'private, no-store')
  generate(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.generate(actor(req), id, body)
  }
  @Get(':reportId/export')
  @RequirePermission('reports.export')
  @Header('Cache-Control', 'private, no-store')
  async export(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Param('reportId') reportId: string,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ) {
    const result = await this.service.export(actor(req), id, reportId)
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(result.bytes)
  }
}
