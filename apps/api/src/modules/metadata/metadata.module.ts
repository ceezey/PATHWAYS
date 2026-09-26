import { Module } from '@nestjs/common'
import { ParticipantsModule } from '../participants/participants.module'

import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

@Module({
  imports: [ParticipantsModule],
  controllers: [MetadataController],
  providers: [MetadataService],
})
export class MetadataModule {}
