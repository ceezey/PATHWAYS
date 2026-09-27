import { Module } from '@nestjs/common'
import { RulesSourceOperationsController } from './rules-source-operations.controller'
import { RulesSourceOperationsService } from './rules-source-operations.service'
@Module({
  controllers: [RulesSourceOperationsController],
  providers: [RulesSourceOperationsService],
})
export class RulesSourceOperationsModule {}
