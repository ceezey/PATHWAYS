import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger'

import { Public } from '../../common/decorators/public.decorator'
import { HealthService } from './health.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'Basic service health check.' })
  getHealth() {
    return this.healthService.getStatus()
  }

  // Fixed bodies only: an outside monitor learns whether the database answers and nothing else.
  @Public()
  @Get('ready')
  @ApiOkResponse({ description: 'The database answers.' })
  @ApiServiceUnavailableResponse({ description: 'The database did not answer in time.' })
  async getReadiness() {
    if (!(await this.healthService.isReady())) {
      throw new ServiceUnavailableException({ status: 'unavailable' })
    }
    return { status: 'ok' }
  }
}
