// These existing domain tests isolate receipt transport; dedicated source tests cover its boundary.
vi.mock('../rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rules/rules-source-operation')>()),
  beginRuleSourceOperation: async (
    _tx: unknown,
    operation: string,
    projectId: string,
    sourceId: string | null,
    _key: unknown,
    body: Record<string, unknown>,
  ) => ({
    kind: 'NEW',
    operationHandle: 'f0000000-0000-4000-8000-000000000001',
    reservedRecordId: ['ACTIVITY_CREATE', 'INDICATOR_CREATE', 'INDICATOR_MEASUREMENT'].includes(
      operation,
    )
      ? 'f0000000-0000-4000-8000-000000000002'
      : null,
    generatedValues: {
      timestamp: '2026-09-27T00:00:00.001Z',
      businessDate: '2026-09-27',
      normalizedValue: operation === 'INDICATOR_MEASUREMENT' ? body.value : null,
      requestHash:
        operation === 'INDICATOR_MEASUREMENT'
          ? (await import('node:crypto'))
              .createHash('sha256')
              .update(
                JSON.stringify({
                  projectId,
                  indicatorId: sourceId,
                  periodStart: body.periodStart,
                  periodEnd: body.periodEnd,
                  value: body.value,
                  source: body.source,
                  note: body.note ?? null,
                  correctsMeasurementId: body.correctsMeasurementId ?? null,
                  correctionReason: body.correctionReason ?? null,
                }),
              )
              .digest('hex')
          : null,
    },
  }),
  finishRuleSourceOperation: async (_tx: unknown, _handle: string, requestId: string) => ({
    requestId,
    committed: true,
    replayed: false,
  }),
  readRuleSourceAcknowledgement: async () => null,
  bootstrapRuleSourceProject: async () => undefined,
}))
import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'

import { activityPresentationStatus, activityTransitionAllowed } from './activities.service'

describe('P05 activity lifecycle presentation', () => {
  const dueDate = new Date('2026-09-13T00:00:00.000Z')

  it('does not mark a non-terminal activity overdue until the business date passes its due date', () => {
    expect(activityPresentationStatus('NOT_STARTED', dueDate, '2026-09-13')).toEqual({
      overdue: false,
      status: 'Planned',
    })
    expect(activityPresentationStatus('IN_PROGRESS', dueDate, '2026-09-14')).toEqual({
      overdue: true,
      status: 'Overdue',
    })
    expect(activityPresentationStatus('FOR_REVIEW', dueDate, '2026-09-14')).toEqual({
      overdue: true,
      status: 'Overdue',
    })
  })

  it('keeps completed and cancelled activities terminal after the due date', () => {
    expect(activityPresentationStatus('COMPLETED', dueDate, '2026-09-14')).toEqual({
      overdue: false,
      status: 'Completed',
    })
    expect(activityPresentationStatus('CANCELLED', dueDate, '2026-09-14')).toEqual({
      overdue: false,
      status: 'Cancelled',
    })
  })

  it('allows only the explicit manager-driven lifecycle transitions', () => {
    expect(activityTransitionAllowed('NOT_STARTED', 'IN_PROGRESS')).toBe(true)
    expect(activityTransitionAllowed('NOT_STARTED', 'CANCELLED')).toBe(true)
    expect(activityTransitionAllowed('IN_PROGRESS', 'CANCELLED')).toBe(true)
    expect(activityTransitionAllowed('IN_PROGRESS', 'IN_PROGRESS')).toBe(false)
    expect(activityTransitionAllowed('FOR_REVIEW', 'CANCELLED')).toBe(false)
    expect(activityTransitionAllowed('COMPLETED', 'IN_PROGRESS')).toBe(false)
    expect(activityTransitionAllowed('CANCELLED', 'IN_PROGRESS')).toBe(false)
  })
})
