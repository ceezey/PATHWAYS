import { Module } from '@nestjs/common'

import { BackupJobDatabase } from './backup-job-database'
import { BackupJobController } from './backup-job.controller'
import { BackupStorage } from './backup-storage'
import { BackupsController } from './backups.controller'
import { BackupsService } from './backups.service'
import { RecoveryPointCaptureService } from './recovery-point-capture.service'

// PrismaModule and StorageModule are global; BackupJobDatabase connects only when the daily job runs.
@Module({
  controllers: [BackupsController, BackupJobController],
  providers: [BackupsService, RecoveryPointCaptureService, BackupStorage, BackupJobDatabase],
})
export class BackupsModule {}
