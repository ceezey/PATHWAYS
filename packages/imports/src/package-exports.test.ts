import { describe, expect, it } from 'vitest'

import * as browser from './index'
import * as server from './server'

const smartMatch = [
  'AUTO_SMART_V2',
  'AUTO_SMART_V2_LIMITS',
  'AUTO_SMART_V3',
  'SMART_DECISION_REASONS',
  'SMART_MATCH_REASONS',
  'SMART_REVIEW_SYNONYMS_V2',
  'SMART_SYNONYMS_V2',
  'SMART_SYNONYMS_V2_ID',
  'SmartMatchInputError',
  'boundedEditDistance',
  'normalizeMappingNameV1',
  'smartMatchColumns',
  'smartMatchColumnsV3',
  'sourceNameKey',
]

describe('package entry points', () => {
  it('keeps the browser entry exports', () => {
    expect(Object.keys(browser).sort()).toEqual(
      [
        ...smartMatch,
        'IMPORT_ENGINEERING_LIMITS',
        'IMPORT_VALUE_MAP_LIMITS',
        'WASHINGTON_GROUP_LEVELS_V1',
        'answerResolver',
        'applyIntakeRules',
        'buildImportValueMap',
        'comparableAnswer',
        'compareHeaders',
        'compatibleImportDataTypes',
        'createFileSummary',
        'formatPmerlRows',
        'hasLetterPrefix',
        'importCoverage',
        'importHeaderLabel',
        'mapKey',
        'parseCsv',
        'parseWorkbook',
        'resolveAnswer',
        'stripLetterPrefix',
        'suggestValueMap',
        'toCsv',
        'toWorkbookBytes',
        'toXlsxBuffer',
        'washingtonGroupLevel',
      ].sort(),
    )
  })

  it('keeps the server entry exports', () => {
    expect(Object.keys(server).sort()).toEqual(
      [
        ...smartMatch,
        'IMPORT_ENGINEERING_LIMITS',
        'IMPORT_VALUE_MAP_LIMITS',
        'WASHINGTON_GROUP_LEVELS_V1',
        'answerResolver',
        'applyIntakeRules',
        'FormDraftError',
        'ImportParseError',
        'buildImportValueMap',
        'comparableAnswer',
        'compatibleImportDataTypes',
        'draftFormFromImport',
        'hasLetterPrefix',
        'importCoverage',
        'mapKey',
        'normalizeImportedRow',
        'parseSecureImport',
        'resolveAnswer',
        'stripLetterPrefix',
        'washingtonGroupLevel',
      ].sort(),
    )
  })
})
