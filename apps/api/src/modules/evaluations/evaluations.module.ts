import { Module } from '@nestjs/common'
import { IndicatorsModule } from '../indicators/indicators.module'
import { EvaluationMetricsService } from './evaluation-metrics'
import { EvaluationsController } from './evaluations.controller'
import { EvaluationsService } from './evaluations.service'

@Module({
  imports: [IndicatorsModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, EvaluationMetricsService],
})
export class EvaluationsModule {}
