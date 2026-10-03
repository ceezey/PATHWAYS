import { describe, expect, it } from 'vitest'

import { parseEvidenceList } from './pathways-client'

describe('evidence list transport', () => {
  it('keeps only count fields for the aggregate scope', () => {
    const parsed = parseEvidenceList({
      scope: 'aggregate',
      activities: [
        {
          activityId: 'a1',
          activityTitle: 'Synthetic activity',
          total: 2,
          submitted: 1,
          approved: 1,
          returned: 0,
          fileName: 'person-name.pdf',
          submitter: 'Synthetic officer',
          url: 'https://example.invalid/proof',
        },
      ],
    })
    expect(parsed).toEqual({
      scope: 'aggregate',
      activities: [
        {
          activityId: 'a1',
          activityTitle: 'Synthetic activity',
          total: 2,
          submitted: 1,
          approved: 1,
          returned: 0,
        },
      ],
    })
  })

  it('rejects malformed or unscoped responses', () => {
    expect(() => parseEvidenceList([])).toThrow('invalid_evidence_response')
    expect(() =>
      parseEvidenceList({ scope: 'aggregate', activities: [{ activityId: 'a1', total: -1 }] }),
    ).toThrow('invalid_evidence_response')
    expect(() =>
      parseEvidenceList({ scope: 'detail', records: [{ id: 'e1', status: 'Unknown' }] }),
    ).toThrow('invalid_evidence_response')
  })
  it('keeps file metadata and review fields on detail records', () => {
    const row = {
      id: 'e1',
      projectId: 'p1',
      activityId: 'a1',
      updateId: 'u1',
      updateUpdatedAt: '2026-01-01T00:00:00.000Z',
      fileName: 'proof.pdf',
      reportTitle: 'Synthetic activity',
      status: 'Approved',
      submitter: 'Synthetic officer',
      submittedDate: '2026-01-01T00:00:00.000Z',
      previewSummary: 'note',
      contentType: 'application/pdf',
      byteSize: 10,
      isIdentifying: true,
      reviewedDate: '2026-01-02T00:00:00.000Z',
      reviewer: 'Synthetic reviewer',
    }
    const parsed = parseEvidenceList({ scope: 'detail', records: [{ ...row, extra: 'x' }] })
    expect(parsed).toEqual({ scope: 'detail', records: [row] })
  })
})
