import { Global, Module } from '@nestjs/common'

import { PRIVATE_STORAGE_FACTORIES, privateStorageFactories } from './private-storage-factories'
import { StorageService } from './storage.service'

@Global()
@Module({
  providers: [
    StorageService,
    { provide: PRIVATE_STORAGE_FACTORIES, useValue: privateStorageFactories },
  ],
  exports: [StorageService, PRIVATE_STORAGE_FACTORIES],
})
export class StorageModule {}
