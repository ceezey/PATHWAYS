// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActivitySummary } from '@/types/pathways'

import { ActivityListTable } from './activity-list-table'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const activity = (title: string, code: string) =>
  ({
    id: `20000000-0000-4000-8000-00000000000${code.length}`,
    projectId: '20000000-0000-4000-8000-000000000002',
    code,
    title,
    status: 'Planned',
    dueDate: '2026-09-30',
    indicatorIds: [],
  }) as unknown as ActivitySummary

describe('activity list CSV export', () => {
  it('abuse: quotes formula-like titles and codes and writes plain text as is', async () => {
    const blobs: Blob[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob)
        return 'blob:synthetic'
      },
      revokeObjectURL: () => undefined,
    })
    render(
      <ActivityListTable
        activities={[
          activity('+639170000001', '=1+1'),
          activity('@x', '-x'),
          activity('Workshop', 'WS-1'),
        ]}
        canReadBudget={false}
        exportedBy="Ana Reyes"
        onOpen={() => undefined}
        projectId="20000000-0000-4000-8000-000000000002"
      />,
    )
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-25T16:30:00Z') })
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    vi.useRealTimers()
    vi.unstubAllGlobals()

    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blobs[0])
    })
    // The confidentiality label is the first line, above the header row.
    expect(csv.split('\r\n').slice(0, 2)).toEqual([
      '"Confidential. Exported by Ana Reyes on 2026-11-26 00:30 (Asia/Manila)."',
      '"Activity","Code","Status","Due date","Beneficiaries","Indicators"',
    ])
    expect(csv).toContain(`"'+639170000001"`)
    expect(csv).toContain(`"'=1+1"`)
    expect(csv).toContain(`"'@x"`)
    expect(csv).toContain(`"'-x"`)
    expect(csv).toContain('"Workshop","WS-1"')
    expect(csv).not.toContain("''")
  })
})
