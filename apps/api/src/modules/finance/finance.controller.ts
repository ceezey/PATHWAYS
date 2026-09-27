import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { FinanceService } from './finance.service'
function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile required.')
  return request.user
}
@Controller('projects/:projectId/finance')
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly service: FinanceService) {}
  @Post('expenses/:expenseId/receipt')
  @RequirePermission('expenses.evidence.submit')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 10485760, fields: 1, fieldSize: 100 },
    }),
  )
  uploadReceipt(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Param('expenseId') expenseId: string,
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer; size: number; mimetype: string } | undefined,
  ) {
    return this.service.uploadReceipt(actor(req), id, expenseId, body, file)
  }
  @Get('expenses/:expenseId/receipt')
  @RequirePermission('expenses.read')
  @Header('Cache-Control', 'private, no-store')
  async receipt(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Param('expenseId') expenseId: string,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ) {
    const result = await this.service.receipt(actor(req), id, expenseId)
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(result.bytes)
  }
  @Get('budgets')
  @RequirePermission('budgets.read')
  @Header('Cache-Control', 'private, no-store')
  budgets(@Req() req: AuthenticatedRequest, @Param('projectId') id: string) {
    return this.service.budgets(actor(req), id)
  }
  @Post('budgets')
  @RequirePermission('budgets.create')
  @Header('Cache-Control', 'private, no-store')
  create(@Req() req: AuthenticatedRequest, @Param('projectId') id: string, @Body() input: unknown) {
    return this.service.createBudget(actor(req), id, input)
  }
  @Patch('budgets/:budgetId')
  @RequirePermission('budgets.update')
  @Header('Cache-Control', 'private, no-store')
  replace(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Param('budgetId') budgetId: string,
    @Body() input: unknown,
  ) {
    return this.service.replaceBudget(actor(req), id, budgetId, input)
  }
  @Get('expenses')
  @RequirePermission('expenses.read')
  @Header('Cache-Control', 'private, no-store')
  expenses(@Req() req: AuthenticatedRequest, @Param('projectId') id: string) {
    return this.service.expenses(actor(req), id)
  }
  @Get('expense-budget-references')
  @RequirePermission('expenses.submit')
  @Header('Cache-Control', 'private, no-store')
  references(@Req() req: AuthenticatedRequest, @Param('projectId') id: string) {
    return this.service.references(actor(req), id)
  }
  @Post('expenses')
  @RequirePermission('expenses.submit')
  @Header('Cache-Control', 'private, no-store')
  submit(@Req() req: AuthenticatedRequest, @Param('projectId') id: string, @Body() input: unknown) {
    return this.service.submit(actor(req), id, input)
  }
  @Post('expenses/:expenseId/review')
  @RequirePermission('expenses.read')
  @Header('Cache-Control', 'private, no-store')
  review(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Param('expenseId') expenseId: string,
    @Body() input: unknown,
  ) {
    return this.service.review(actor(req), id, expenseId, input)
  }
  @Post('expenses/:expenseId/signoff')
  @RequirePermission('expenses.signoff')
  @Header('Cache-Control', 'private, no-store')
  signoff(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') id: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.service.signoff(actor(req), id, expenseId)
  }
}
