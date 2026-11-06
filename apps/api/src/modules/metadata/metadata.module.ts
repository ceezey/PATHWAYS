import { Module } from '@nestjs/common'
import { ParticipantsModule } from '../participants/participants.module'

import { FormDefinitionExportService } from './form-definition-export.service'
import { FormDraftFromStageService } from './form-draft-from-stage.service'
import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

@Module({
  imports: [ParticipantsModule],
  controllers: [MetadataController],
  providers: [MetadataService, FormDefinitionExportService, FormDraftFromStageService],
})
export class MetadataModule {}
