import { Module } from '@nestjs/common'
import { IndicatorLibraryController } from './indicator-library.controller'
import { IndicatorLibraryService } from './indicator-library.service'
import { IndicatorsController } from './indicators.controller'
import { IndicatorsService } from './indicators.service'
@Module({
  controllers: [IndicatorsController, IndicatorLibraryController],
  providers: [IndicatorsService, IndicatorLibraryService],
  exports: [IndicatorsService],
})
export class IndicatorsModule {}
