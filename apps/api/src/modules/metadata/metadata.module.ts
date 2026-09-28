import { Module } from '@nestjs/common'
import { ParticipantsModule } from '../participants/participants.module'

import { FormDefinitionExportService } from './form-definition-export.service'
import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

@Module({
  imports: [ParticipantsModule],
  controllers: [MetadataController],
  providers: [MetadataService, FormDefinitionExportService],
})
export class MetadataModule {}
