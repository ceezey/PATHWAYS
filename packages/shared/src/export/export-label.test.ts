import { describe, expect, it } from 'vitest'

import { exportLabel } from './export-label'

describe('exportLabel', () => {
  it('states who exported and when, in Manila time', () => {
    expect(
      exportLabel({ exportedBy: 'Ana Reyes', exportedAt: new Date('2026-11-25T16:30:00Z') }),
    ).toBe('Confidential. Exported by Ana Reyes on 2026-11-26 00:30 (Asia/Manila).')
  })

  it('prints midnight in Manila as 00, not 24', () => {
    expect(
      exportLabel({ exportedBy: 'Ana Reyes', exportedAt: new Date('2026-11-25T16:00:00Z') }),
    ).toBe('Confidential. Exported by Ana Reyes on 2026-11-26 00:00 (Asia/Manila).')
  })

  it('keeps the label on one line', () => {
    expect(
      exportLabel({
        exportedBy: ' Ana\r\n  Reyes\t',
        exportedAt: new Date('2026-01-05T01:07:00Z'),
      }),
    ).toBe('Confidential. Exported by Ana Reyes on 2026-01-05 09:07 (Asia/Manila).')
  })
})
