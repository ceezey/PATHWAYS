import { Controller, ForbiddenException, Header, HttpCode, Inject, Post, Req } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { Public } from '../../common/decorators/public.decorator'
import { assertBackupJobRequest } from './backup-job-auth'
import { BackupJobDatabase } from './backup-job-database'
import { RecoveryPointCaptureService } from './recovery-point-capture.service'

/** Called once a day by the backup workflow; it needs both the bearer token and the job's own database login. */
@Controller('internal/backups')
export class BackupJobController {
  private readonly token = readApiEnv(process.env).BACKUP_JOB_TOKEN

  constructor(
    @Inject(RecoveryPointCaptureService) private readonly capture: RecoveryPointCaptureService,
    @Inject(BackupJobDatabase) private readonly database: BackupJobDatabase,
  ) {}

  @Post('daily')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  async daily(@Req() request: Parameters<typeof assertBackupJobRequest>[0]) {
    assertBackupJobRequest(request, this.token)
    if (!this.database.isConfigured()) throw new ForbiddenException('Backup job is unavailable.')
    return this.capture.runDaily()
  }
}
