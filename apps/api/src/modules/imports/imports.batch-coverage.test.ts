// biome-ignore organizeImports: the harness registers the module mocks and must load first
import { actor, batch, projectId, service, tx, useImportsHarness } from './imports.service.harness'

import { describe, expect, it } from 'vitest'

const field = (id: string, code: string, patch: Record<string, unknown> = {}) => ({
  id,
  code,
  label: code,
  dataType: 'TEXT',
  allowedValues: null,
  minimumLength: null,
  maximumLength: null,
  sourceNames: [],
  valueAliases: null,
  importDefault: null,
  rule: null,
  isRequired: false,
  ...patch,
})
const nameId = '61000000-0000-4000-8000-000000000001'
const sexId = '61000000-0000-4000-8000-000000000002'
const privateValue = 'Synthetic-Private-Value-4471'

const mapping = (
  key: string,
  status: string,
  target: string | null,
  message = 'AUTO_SMART_V3:AUTO_MATCH',
) => ({
  sourceFieldName: key,
  status,
  revision: 1,
  targetField: target ? { code: target, label: target } : null,
  validationMessage: message,
  suggestedField: null,
  matchScore: null,
  matchReason: null,
  dataType: null,
  valueMap: null,
})

const staged = [
  mapping('column_0001', 'MAPPED', 'first_name'),
  mapping('column_0002', 'PENDING', null),
  mapping('column_0003', 'MAPPED', 'sex'),
]

function stage(mappings: unknown[], patch: Record<string, unknown> = {}) {
  const row = batch({ status: 'MAPPED', mappingRevision: 1, ...patch })
  tx.dataImportBatch.findFirst.mockImplementation(async (query: { select?: object }) =>
    query.select && 'sourceHeaders' in query.select
      ? {
          sourceHeaders: [
            { key: 'column_0001', columnIndex: 1, header: 'Given name' },
            { key: 'column_0002', columnIndex: 2, header: 'Mystery' },
            { key: 'column_0003', columnIndex: 3, header: 'Gender' },
          ],
        }
      : row,
  )
  tx.dataImportBatch.findUnique.mockResolvedValue({ sourceHeaders: [] })
  tx.metadataMapping.findMany.mockResolvedValue(mappings)
  tx.formField.findMany.mockResolvedValue([
    field(nameId, 'first_name'),
    field(sexId, 'sex', { dataType: 'SELECT', allowedValues: ['MALE', 'FEMALE'] }),
  ])
  tx.dataImportRow.findMany.mockResolvedValue([
    { rawData: { column_0001: privateValue, column_0002: 'x', column_0003: 'MALE' } },
    { rawData: { column_0001: 'Ana', column_0002: 'y', column_0003: 'Unknown' } },
  ])
}

describe('batch detail coverage', () => {
  useImportsHarness()

  it('returns NOT_COVERED counts for a staged AUTO_SMART_V3 batch, for any reader of the detail', async () => {
    stage(staged, { uploadedById: 'someone-else' })

    const detail = await service.getBatch(actor, projectId, batch().id)

    expect(detail.coverage).toEqual({
      coverage: 'NOT_COVERED',
      uncoveredColumns: 1,
      unresolvedValues: 1,
    })
    expect(JSON.stringify(detail.coverage)).not.toContain(privateValue)
  })

  it('returns COVERED when every column is mapped or ignored and every answer resolves', async () => {
    stage([
      mapping('column_0001', 'MAPPED', 'first_name'),
      mapping('column_0002', 'IGNORED', null),
      mapping('column_0003', 'MAPPED', 'sex'),
    ])
    tx.dataImportRow.findMany.mockResolvedValue([
      { rawData: { column_0001: 'Ana', column_0002: 'x', column_0003: 'MALE' } },
    ])

    expect((await service.getBatch(actor, projectId, batch().id)).coverage).toEqual({
      coverage: 'COVERED',
      uncoveredColumns: 0,
      unresolvedValues: 0,
    })
  })

  it('is null for a V2 revision, a later revision, a validated batch and an unmapped batch', async () => {
    const v2 = staged.map((item) => ({ ...item, validationMessage: 'AUTO_SMART_V2:AUTO_MATCH' }))
    const cases: Array<[unknown[], Record<string, unknown>]> = [
      [v2, {}],
      [staged, { mappingRevision: 2 }],
      [staged, { status: 'VALIDATED' }],
      [[], { status: 'UPLOADED', mappingRevision: 0 }],
    ]
    for (const [mappings, patch] of cases) {
      stage(mappings, patch)
      expect((await service.getBatch(actor, projectId, batch().id)).coverage).toBeNull()
    }
  })
})
