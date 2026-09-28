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
})
