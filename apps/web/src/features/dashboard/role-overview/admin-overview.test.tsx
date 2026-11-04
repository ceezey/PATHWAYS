/* @vitest-environment jsdom */
import type { RoleOverview } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminOverview } from './admin-overview'

const p = '20000000-0000-4000-8000-00000000000a'
const f = '40000000-0000-4000-8000-000000000001'
const b = '50000000-0000-4000-8000-000000000001'
const at = '2026-11-01T00:00:00.000Z'
const empty = {
  contractVersion: 'dashboard.role-overview.v1',
  businessDate: '2026-11-04',
  projects: [],
  formDrafts: { count: 0, rows: [] },
  publicationQueue: { count: 0, rows: [] },
  importAttention: { count: 0, rows: [] },
  ruleDrafts: { count: 0, rows: [] },
  alerts: null,
} as unknown as RoleOverview
const data = {
  ...empty,
  formDrafts: {
    count: 2,
    rows: [
      {
        formId: f,
        projectId: p,
        projectTitle: 'Safe Schools',
        code: 'intake',
        name: 'Intake survey',
        version: 2,
        updatedAt: at,
        ownEdit: true,
      },
    ],
  },
  publicationQueue: {
    count: 1,
    rows: [
      {
        projectId: p,
        projectTitle: 'Safe Schools',
        state: 'APPROVED',
        submittedByName: 'Pat Manager',
        submittedAt: at,
        ownSubmission: false,
      },
    ],
  },
  importAttention: {
    count: 1,
    rows: [
      {
        batchId: b,
        projectId: p,
        projectTitle: 'Safe Schools',
        fileName: 'roster.xlsx',
        partCode: null,
        status: 'FAILED',
        uploadedAt: at,
      },
    ],
  },
  ruleDrafts: {
    count: 1,
    rows: [{ ruleId: f, code: 'LOW_ATT', name: 'Low attendance', version: 1, updatedAt: at }],
  },
} as RoleOverview

describe('AdminOverview', () => {
  afterEach(cleanup)

  it('shows the counts and opens each queue item on its page', () => {
    const onOpen = vi.fn()
    render(<AdminOverview data={data} onOpen={onOpen} />)
    expect(screen.getByLabelText('Administration counts').textContent).toContain('Form drafts2')
    fireEvent.click(screen.getByRole('button', { name: 'Open draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open import' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open rules' }))
    expect(onOpen.mock.calls.map(([href]) => href)).toEqual([
      `/collection/projects/${p}/forms/${f}`,
      `/projects/${p}/transparency`,
      `/collection/import?project=${p}&batch=${b}`,
      '/settings/rules',
    ])
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText(/More items are waiting/)).toBeTruthy()
  })

  it('marks a draft the viewer edited as needing another admin', () => {
    render(<AdminOverview data={data} onOpen={vi.fn()} />)
    expect(screen.getAllByText('Needs another admin')).toHaveLength(1)
  })

  it('shows the empty state when nothing is waiting', () => {
    render(<AdminOverview data={empty} onOpen={vi.fn()} />)
    expect(screen.getByText('Nothing needs your attention.')).toBeTruthy()
    expect(screen.queryByText(/More items are waiting/)).toBeNull()
  })
})
