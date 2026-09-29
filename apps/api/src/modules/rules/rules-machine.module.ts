import { type DynamicModule, Module } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { type MachineConfig, RulesMachineBoundary } from './rules-machine-boundary'
import { type RulesDatabaseOptions, RulesMachineSqlClient } from './rules-machine-sql'
import { RULES_MACHINE_SQL, RulesMachineWorker } from './rules-machine-worker'
import { RulesMachineController } from './rules-machine.controller'

export type RulesMachineOptions = MachineConfig & RulesDatabaseOptions
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules require a decorated class with a static registration API.
export class RulesMachineModule {
  // Root composition supplies validated server configuration. Disabled setup
  // installs strict bindings but never constructs/connects database clients.
  static register(options: RulesMachineOptions): DynamicModule {
    const fixed = Object.freeze({ ...options })
    return {
      module: RulesMachineModule,
      controllers: [RulesMachineController],
      providers: [
        RulesMachineWorker,
        {
          provide: RULES_MACHINE_SQL,
          useFactory: () =>
            fixed.enabled
              ? new RulesMachineSqlClient(fixed)
              : {
                  calendar: async () => {
                    throw new Error('Rule processing is unavailable.')
                  },
                },
        },
        {
          provide: RulesMachineBoundary,
          inject: [Reflector],
          useFactory: (reflector: Reflector) =>
            new RulesMachineBoundary(reflector, () => fixed, [
              {
                controller: RulesMachineController,
                handler: RulesMachineController.prototype.drain,
                purpose: 'DRAIN',
              },
              {
                controller: RulesMachineController,
                handler: RulesMachineController.prototype.sweep,
                purpose: 'SWEEP',
              },
            ]),
        },
      ],
      exports: [RulesMachineBoundary],
    }
  }
}
