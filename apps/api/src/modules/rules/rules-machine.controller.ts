import { Controller, HttpCode, Inject, Post, Req, SetMetadata } from '@nestjs/common'
import {
  MACHINE_PURPOSE,
  releaseMachineInvocation,
  requireMachineInvocation,
} from './rules-machine-boundary'
import { RulesMachineWorker } from './rules-machine-worker'

@Controller('internal/rules')
export class RulesMachineController {
  constructor(@Inject(RulesMachineWorker) private readonly worker: RulesMachineWorker) {}
  @Post('drain')
  @HttpCode(200)
  @SetMetadata(MACHINE_PURPOSE, 'DRAIN')
  async drain(@Req() request: object) {
    try {
      return await this.worker.drain(requireMachineInvocation(request, 'DRAIN'))
    } finally {
      releaseMachineInvocation(request)
    }
  }
  @Post('sweep')
  @HttpCode(200)
  @SetMetadata(MACHINE_PURPOSE, 'SWEEP')
  async sweep(@Req() request: object) {
    try {
      return await this.worker.sweep(requireMachineInvocation(request, 'SWEEP'))
    } finally {
      releaseMachineInvocation(request)
    }
  }
}
