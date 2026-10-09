import {
  createPrivateInspectionReader,
  createPrivateObjectStreamer,
  createPrivateUploadVerifier,
} from './private-inspection-reader'

// Nest token under which the storage module provides the private storage factories.
export const PRIVATE_STORAGE_FACTORIES = Symbol('PRIVATE_STORAGE_FACTORIES')

// The production private object reader, upload verifier and object streamer factories.
export const privateStorageFactories = {
  createPrivateInspectionReader,
  createPrivateUploadVerifier,
  createPrivateObjectStreamer,
}

export type PrivateStorageFactories = typeof privateStorageFactories
