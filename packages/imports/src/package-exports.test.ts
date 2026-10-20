import { describe, expect, it } from 'vitest'

import * as browser from './index'
import * as server from './server'

const smartMatch = [
  'AUTO_SMART_V2',
  'AUTO_SMART_V2_LIMITS',
  'SMART_DECISION_REASONS',
  'SMART_MATCH_REASONS',
  'SMART_REVIEW_SYNONYMS_V2',
  'SMART_SYNONYMS_V2',
  'SMART_SYNONYMS_V2_ID',
  'SmartMatchInputError',
  'boundedEditDistance',
  'normalizeMappingNameV1',
  'smartMatchColumns',
]

describe('package entry points', () => {
  it('keeps the browser entry exports', () => {
    expect(Object.keys(browser).sort()).toEqual(
      [
        ...smartMatch,
        'IMPORT_ENGINEERING_LIMITS',
        'IMPORT_VALUE_MAP_LIMITS',
        'buildImportValueMap',
        'compareHeaders',
        'compatibleImportDataTypes',
        'createFileSummary',
        'formatPmerlRows',
        'importHeaderLabel',
        'mapKey',
        'parseCsv',
        'parseWorkbook',
        'suggestValueMap',
        'toCsv',
        'toWorkbookBytes',
        'toXlsxBuffer',
      ].sort(),
    )
  })

  it('keeps the server entry exports', () => {
    expect(Object.keys(server).sort()).toEqual(
      [
        ...smartMatch,
        'IMPORT_ENGINEERING_LIMITS',
        'IMPORT_VALUE_MAP_LIMITS',
        'ImportParseError',
        'buildImportValueMap',
        'compatibleImportDataTypes',
        'mapKey',
        'normalizeImportedRow',
        'parseSecureImport',
      ].sort(),
    )
  })
})
