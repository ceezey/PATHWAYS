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
        onOpen={() => undefined}
        projectId="20000000-0000-4000-8000-000000000002"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    vi.unstubAllGlobals()

    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blobs[0])
    })
    expect(csv).toContain(`"'+639170000001"`)
    expect(csv).toContain(`"'=1+1"`)
    expect(csv).toContain(`"'@x"`)
    expect(csv).toContain(`"'-x"`)
    expect(csv).toContain('"Workshop","WS-1"')
    expect(csv).not.toContain("''")
  })
})
