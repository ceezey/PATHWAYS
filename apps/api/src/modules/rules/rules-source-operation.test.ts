import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  abandonRuleSourceOperation,
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  proofClientAcknowledgement,
  readRuleSourceAcknowledgement,
  sourceMutationBody,
} from './rules-source-operation'
const project = '10000000-0000-4000-8000-000000000001'
const source = '20000000-0000-4000-8000-000000000001'
const request = '30000000-0000-4000-8000-000000000001'
const handle = '40000000-0000-4000-8000-000000000001'
const key = { kind: 'CLIENT_MUTATION' as const, id: request }
const body = {
  title: 'Synthetic source',
  status: 'ONGOING',
  expectedUpdatedAt: '2026-09-27T01:00:00.000Z',
}
const generatedValues = {
  timestamp: '2026-09-27T01:00:00.000Z',
  businessDate: '2026-09-27',
  normalizedValue: null,
  requestHash: null,
}
function fixture(value: unknown) {
  const query = vi.fn(async () => [{ result: value }])
  return { tx: { $queryRaw: query } as unknown as Prisma.TransactionClient, query }
}
describe('fixed source-operation transport privacy and retry boundaries', () => {
  it('maps only an exact validated private proof receipt to its original public client key', () => {
    expect(
      proofClientAcknowledgement(
        { requestId: handle, committed: true, replayed: true },
        handle,
        request,
      ),
    ).toEqual({ requestId: request, committed: true, replayed: true })
    for (const response of [
      { requestId: source, committed: true, replayed: true },
      { requestId: handle, committed: true, replayed: true, note: 'Private' },
      { requestId: handle, committed: false, replayed: true },
    ])
      expect(() => proofClientAcknowledgement(response, handle, request)).toThrow(
        'could not be confirmed',
      )
  })
  it('canonicalizes the same immutable semantic input while preserving missing/null and duplicate multiplicity', () => {
    const input = {
      clientMutationId: request,
      title: ' Synthetic ',
      projectOfficerIds: [source.toUpperCase(), request],
      programManagerId: null,
      expectedUpdatedAt: '2026-09-27T09:00:00+08:00',
      startDate: '2026-09-27T01:00:00.000Z',
      value: '-12.3400',
      files: [
        { fileName: ' b.png ', sha256: 'b'.repeat(64) },
        { fileName: ' a.png ', sha256: 'a'.repeat(64) },
      ],
    }
    const canonical = sourceMutationBody(input)
    expect(canonical).toMatchObject({
      title: 'Synthetic',
      programManagerId: null,
      expectedUpdatedAt: '2026-09-27T01:00:00.000Z',
      startDate: '2026-09-27',
      value: '-12.34',
    })
    expect(canonical).not.toHaveProperty('clientMutationId')
    expect(canonical).not.toHaveProperty('sector')
    expect(input.title).toBe(' Synthetic ')
    expect(sourceMutationBody({ assignedUserIds: [source, source] }).assignedUserIds).toEqual([
      source,
      source,
    ])
    expect(
      sourceMutationBody({
        ...input,
        projectOfficerIds: [request, source.toLowerCase()],
        files: [...input.files].reverse(),
      }),
    ).toEqual(canonical)
  })
  it('nonmeasurement generated values must be exactly null and cannot smuggle private metric metadata', async () => {
    for (const values of [
      { ...generatedValues, normalizedValue: '1' },
      { ...generatedValues, requestHash: 'a'.repeat(64) },
      { ...generatedValues, note: 'private' },
      { timestamp: generatedValues.timestamp, businessDate: generatedValues.businessDate },
    ]) {
      await expect(
        beginRuleSourceOperation(
          fixture({
            kind: 'NEW',
            operationHandle: handle,
            reservedRecordId: null,
            generatedValues: values,
          }).tx,
          'PROJECT_UPDATE',
          project,
          project,
          key,
          body,
        ),
      ).rejects.toThrow('could not be confirmed')
    }
  })
  it('binds explicit abandonment or immutable committed acknowledgement to original request without echoing input', async () => {
    for (const response of [
      { requestId: request, abandoned: true },
      { requestId: request, committed: true, replayed: true },
    ])
      expect(
        await abandonRuleSourceOperation(
          fixture(response).tx,
          'PROJECT_UPDATE',
          project,
          project,
          key,
          body,
        ),
      ).toEqual(response)
    for (const response of [
      { requestId: source, abandoned: true },
      { requestId: request, abandoned: true, note: 'private' },
      { requestId: request, committed: true, replayed: false },
      { requestId: request, abandoned: false },
    ])
      await expect(
        abandonRuleSourceOperation(
          fixture(response).tx,
          'PROJECT_UPDATE',
          project,
          project,
          key,
          body,
        ),
      ).rejects.toThrow('could not be confirmed')
  })
  it('binds REPLAY acknowledgement to original request and rejects copied private domain data', async () => {
    for (const value of [
      { kind: 'REPLAY', acknowledgement: { requestId: source, committed: true, replayed: true } },
      {
        kind: 'REPLAY',
        acknowledgement: { requestId: request, committed: true, replayed: true, note: 'Private' },
      },
      { kind: 'REPLAY', acknowledgement: { requestId: request, committed: true, replayed: false } },
    ]) {
      const f = fixture(value)
      await expect(
        beginRuleSourceOperation(f.tx, 'PROJECT_UPDATE', project, project, key, body),
      ).rejects.toThrow('could not be confirmed')
    }
    const f = fixture({
      kind: 'REPLAY',
      acknowledgement: { requestId: request, committed: true, replayed: true },
    })
    expect(
      await beginRuleSourceOperation(f.tx, 'PROJECT_UPDATE', project, project, key, body),
    ).toEqual({
      kind: 'REPLAY',
      acknowledgement: { requestId: request, committed: true, replayed: true },
    })
  })
  it('does not interpret caller scopes or hostile body content as SQL or operation selectors', async () => {
    const f = fixture({
      kind: 'NEW',
      operationHandle: handle,
      reservedRecordId: null,
      generatedValues,
    })
    await beginRuleSourceOperation(f.tx, 'PROJECT_UPDATE', project, project, key, {
      ...body,
      description: "'); DROP TABLE secret;--",
    })
    const [sql, ...values] = f.query.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ]
    expect(sql.join('')).toContain('pathways.f10_begin_source_operation(')
    expect(sql.join('')).not.toContain('DROP TABLE')
    expect(values).toContain('PROJECT_UPDATE')
    expect(values.at(-1)).toContain('DROP TABLE')
  })
  it('rejects wrong request purpose or malformed key before dispatch', async () => {
    const f = fixture(null)
    await expect(
      beginRuleSourceOperation(f.tx, 'ACTIVITY_PROOF_FINALIZE', project, source, key, {}),
    ).rejects.toThrow('identity')
    await expect(
      beginRuleSourceOperation(
        f.tx,
        'PROJECT_UPDATE',
        project,
        project,
        { ...key, id: 'bad' },
        body,
      ),
    ).rejects.toThrow('identity')
    expect(f.query).not.toHaveBeenCalled()
  })
  it('requires canonical server timestamps/calendar and operation-specific reserved IDs', async () => {
    for (const value of [
      { kind: 'NEW', operationHandle: handle, reservedRecordId: null, generatedValues },
      {
        kind: 'NEW',
        operationHandle: handle,
        reservedRecordId: source,
        generatedValues: { ...generatedValues, businessDate: '2026-09-26' },
      },
      {
        kind: 'NEW',
        operationHandle: handle,
        reservedRecordId: source,
        generatedValues: { ...generatedValues, timestamp: '2026-09-27T01:00:00Z' },
      },
    ]) {
      const f = fixture(value)
      await expect(
        beginRuleSourceOperation(f.tx, 'ACTIVITY_CREATE', project, null, key, {}),
      ).rejects.toThrow('could not be confirmed')
    }
  })
  it('keeps generated measurement metadata private to trusted service and accepts only normalized exact values', async () => {
    const value = {
      kind: 'NEW',
      operationHandle: handle,
      reservedRecordId: source,
      generatedValues: {
        ...generatedValues,
        normalizedValue: '-12.34',
        requestHash: 'a'.repeat(64),
      },
    }
    const f = fixture(value)
    expect(
      await beginRuleSourceOperation(
        f.tx,
        'INDICATOR_MEASUREMENT',
        project,
        source,
        { kind: 'CLIENT_MEASUREMENT', id: request },
        {},
      ),
    ).toEqual(value)
    f.query.mockResolvedValueOnce([
      {
        result: {
          ...value,
          generatedValues: { ...value.generatedValues, normalizedValue: '-12.3400' },
        },
      },
    ])
    await expect(
      beginRuleSourceOperation(
        f.tx,
        'INDICATOR_MEASUREMENT',
        project,
        source,
        { kind: 'CLIENT_MEASUREMENT', id: request },
        {},
      ),
    ).rejects.toThrow('could not be confirmed')
  })
  it('encodes source ACK original canonical envelope without exposing records and handles absent receipts', async () => {
    const f = fixture(null)
    expect(
      await readRuleSourceAcknowledgement(f.tx, 'PROJECT_UPDATE', project, project, key, body),
    ).toBeNull()
    const call = f.query.mock.calls[0] as unknown as unknown[]
    expect(JSON.parse(call.at(-1) as string)).toEqual({
      operation: 'PROJECT_UPDATE',
      sourceId: project,
      body,
    })
  })
  it('rejects foreign/malformed/unfinished finish acknowledgements', async () => {
    for (const value of [
      { requestId: source, committed: true, replayed: false },
      { requestId: request, committed: false, replayed: false },
      { requestId: request, committed: true, replayed: true },
      { requestId: request, committed: true, replayed: false, sourceId: source },
    ]) {
      const f = fixture(value)
      await expect(finishRuleSourceOperation(f.tx, handle, request)).rejects.toThrow(
        'could not be confirmed',
      )
    }
  })
  it.each([
    ['42501', 'current access'],
    ['40001', 'changed'],
    ['23505', 'changed'],
    ['22023', 'Invalid mutation'],
    ['unknown', 'could not be confirmed'],
  ])('maps certified SQLSTATE%s without secret SQL/body leakage', async (code, message) => {
    const f = fixture(null)
    f.query.mockRejectedValueOnce({
      meta: { code },
      message: 'Private secret SQL',
      body: { note: 'Sensitive' },
    })
    await expect(
      beginRuleSourceOperation(f.tx, 'PROJECT_UPDATE', project, project, key, body),
    ).rejects.toThrow(message)
  })
})
