import { describe, expect, it } from 'vitest'

import { importRequestLimits } from '@pathways/shared'
import { IMPORT_ENGINEERING_LIMITS } from './limits'
import { IMPORT_VALUE_MAP_LIMITS } from './value-map'

describe('processing claim size', () => {
  it('keeps one process request to at most one checkpoint chunk', () => {
    expect(IMPORT_ENGINEERING_LIMITS.processingClaimRows).toBeLessThanOrEqual(
      IMPORT_ENGINEERING_LIMITS.processingCheckpointRows,
    )
  })
})

describe('import request limits', () => {
  it('match the engineering and value map limits', () => {
    expect(importRequestLimits).toEqual({
      maxSourceColumns: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
      maxValueMapEntries: IMPORT_VALUE_MAP_LIMITS.maxEntries,
      maxValueMapTextLength: IMPORT_VALUE_MAP_LIMITS.maxTextLength,
    })
  })
})
