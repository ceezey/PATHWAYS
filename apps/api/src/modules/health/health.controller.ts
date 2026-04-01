import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { Public } from '@app/common/decorators/public.decorator'
import { HealthService } from '@app/modules/health/health.service'

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
}
