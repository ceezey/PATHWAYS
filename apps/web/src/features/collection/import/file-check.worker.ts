import type { FileCheckReport } from '@pathways/imports'

import { type FileCheckRequest, runFileCheckRequest } from './file-check-run'

// Dedicated worker scope, typed locally so the DOM library stays the project default.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<FileCheckRequest>) => void) | null
  postMessage: (message: FileCheckReport | null) => void
}

scope.onmessage = (event) => {
  scope.postMessage(runFileCheckRequest(event.data))
}
