import 'reflect-metadata'

import { describe, expect, it } from 'vitest'

import {
  createPrivateInspectionReader,
  createPrivateObjectStreamer,
  createPrivateUploadVerifier,
} from './private-inspection-reader'
import { PRIVATE_STORAGE_FACTORIES } from './private-storage-factories'
import { StorageModule } from './storage.module'

describe('StorageModule', () => {
  it('provides and exports the production private storage factories', () => {
    expect(Reflect.getMetadata('providers', StorageModule)).toContainEqual({
      provide: PRIVATE_STORAGE_FACTORIES,
      useValue: {
        createPrivateInspectionReader,
        createPrivateUploadVerifier,
        createPrivateObjectStreamer,
      },
    })
    expect(Reflect.getMetadata('exports', StorageModule)).toContain(PRIVATE_STORAGE_FACTORIES)
  })
})
