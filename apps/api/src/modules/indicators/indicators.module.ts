import { Module } from '@nestjs/common'
import { IndicatorLibraryController } from './indicator-library.controller'
import { IndicatorLibraryService } from './indicator-library.service'
import { IndicatorValuesController } from './indicator-values.controller'
import { IndicatorsController } from './indicators.controller'
import { IndicatorsService } from './indicators.service'
@Module({
  controllers: [IndicatorsController, IndicatorValuesController, IndicatorLibraryController],
  providers: [IndicatorsService, IndicatorLibraryService],
  exports: [IndicatorsService],
})
export class IndicatorsModule {}
