import { ParticipantsModule } from '@app/modules/participants/participants.module'
import { Module } from '@nestjs/common'

import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

@Module({
  imports: [ParticipantsModule],
  controllers: [MetadataController],
  providers: [MetadataService],
})
export class MetadataModule {}
