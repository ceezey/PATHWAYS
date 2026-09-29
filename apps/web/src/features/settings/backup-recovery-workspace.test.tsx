/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

import { BackupRecoveryWorkspace } from './backup-recovery-workspace'

describe('backup and recovery workspace', () => {
  afterEach(cleanup)

  it('offers no create, import, download or restore action without a backend', () => {
    render(<BackupRecoveryWorkspace />)
    expect(screen.getByRole('heading', { name: 'Backup & Recovery' })).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0)
  })
})
