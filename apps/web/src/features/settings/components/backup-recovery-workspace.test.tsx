/* @vitest-environment jsdom */

import { PathwaysClientError } from '@/lib/api/core/request'
import { recoveryPointProblemMessages } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  permissions: ['backups.create', 'backups.restore'],
  points: [] as unknown[],
  fileMode: 'manifest',
  error: false,
  pending: false,
  refetch: vi.fn(),
  create: vi.fn(),
  verify: vi.fn(),
  download: vi.fn(),
  restore: vi.fn(),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { permissions: state.permissions } }),
}))
vi.mock('@/lib/rbac/policy', () => ({
  principalHasAtomicPermission: (profile: { permissions?: string[] } | null, permission: string) =>
    Boolean(profile?.permissions?.includes(permission)),
}))
vi.mock('@/lib/api/backups', () => ({
  backupsClient: {
    list: vi.fn(),
    create: state.create,
    verify: state.verify,
    download: state.download,
    restore: state.restore,
  },
}))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: () => ({
    data: state.error
      ? undefined
      : {
          points: state.points,
          currentMigration: '0091_backup_recovery',
          fileMode: state.fileMode,
          organizationCode: 'ORG1',
        },
    isPending: state.pending,
    isError: state.error,
    refetch: state.refetch,
  }),
}))

import { BackupRecoveryWorkspace } from './backup-recovery-workspace'

const point = (index: number, patch: Record<string, unknown> = {}) => ({
  id: `79300000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  pointType: 'MANUAL',
  status: 'READY',
  fileMode: 'manifest',
  createdBy: { id: '79300000-0000-4000-8000-000000000099', name: 'Synthetic Admin' },
  startedAt: '2026-11-12T05:59:59.000Z',
  capturedAt: '2026-11-12T06:00:00.000Z',
  completedAt: '2026-11-12T06:00:09.000Z',
  migrationName: '0091_backup_recovery',
  sizeBytes: 1048576,
  failureReason: null,
  ...patch,
})
const rows = () => screen.getAllByRole('row').slice(1)
const rowOf = (id: string) => {
  const found = rows().find((row) => row.getAttribute('data-point-id') === id)
  if (!found) throw new Error(`No row for ${id}`)
  return found
}
const generic = 'The requested operation could not be completed.'

describe('backup and recovery workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permissions = ['backups.create', 'backups.restore']
    state.fileMode = 'manifest'
    state.error = false
    state.pending = false
    state.points = [
      point(1),
      point(2, {
        pointType: 'AUTOMATIC',
        createdBy: null,
        status: 'UNAVAILABLE',
        failureReason: "This recovery point's data file is missing.",
      }),
      point(3, { status: 'INCOMPATIBLE', migrationName: '0090_x' }),
      point(4, { status: 'CREATING', capturedAt: null, completedAt: null, sizeBytes: null }),
      point(5, {
        status: 'FAILED',
        failureReason: 'Backup storage was unavailable.',
        sizeBytes: null,
      }),
    ]
  })
  afterEach(cleanup)

  it('lists each point with its time, creator, type, size and status', () => {
    render(<BackupRecoveryWorkspace />)
    expect(screen.getByRole('heading', { name: 'Backup & Recovery' })).toBeTruthy()
    const ready = rowOf(point(1).id)
    expect(within(ready).getByText(/Nov 12, 2026, 2:00\sPM/)).toBeTruthy()
    expect(within(ready).getByText('Synthetic Admin')).toBeTruthy()
    expect(within(ready).getByText('Manual')).toBeTruthy()
    expect(within(ready).getByText('1.0 MB')).toBeTruthy()
    expect(within(ready).getByText('Ready')).toBeTruthy()
    expect(within(rowOf(point(2).id)).getByText('System')).toBeTruthy()
    expect(
      within(rowOf(point(2).id)).getByText("This recovery point's data file is missing."),
    ).toBeTruthy()
    expect(within(rowOf(point(5).id)).getByText('Backup storage was unavailable.')).toBeTruthy()
    expect(within(rowOf(point(5).id)).getByText('Not recorded')).toBeTruthy()
  })

  it('enables Restore only for READY points and Verify and Download for checkable ones', () => {
    render(<BackupRecoveryWorkspace />)
    const button = (index: number, name: string) =>
      within(rowOf(point(index).id)).getByRole('button', { name }) as HTMLButtonElement
    expect(button(1, 'Restore').disabled).toBe(false)
    for (const index of [2, 3, 4, 5]) expect(button(index, 'Restore').disabled).toBe(true)
    for (const index of [1, 2, 3]) {
      expect(button(index, 'Verify').disabled).toBe(false)
      expect(button(index, 'Download').disabled).toBe(false)
    }
    for (const index of [4, 5]) {
      expect(button(index, 'Verify').disabled).toBe(true)
      expect(button(index, 'Download').disabled).toBe(true)
    }
  })

  it('creates once on a double click, confirms and refetches', async () => {
    let resolve: (value: unknown) => void = () => undefined
    state.create.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    render(<BackupRecoveryWorkspace />)
    const create = screen.getByRole('button', { name: 'Create Backup' })
    fireEvent.click(create)
    fireEvent.click(create)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Creating backup' })).toBeTruthy()
    resolve(point(6))
    expect(await screen.findByText('Recovery point saved.')).toBeTruthy()
    expect(state.refetch).toHaveBeenCalled()
  })

  it('shows the storage refusal (E1) and the recorded failure (E2), refetching after both', async () => {
    state.create.mockRejectedValueOnce(
      new PathwaysClientError(
        'Backup storage is unavailable. Try again later.',
        'network',
        [],
        503,
      ),
    )
    render(<BackupRecoveryWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Backup' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Backup storage is unavailable. Try again later.',
    )
    state.create.mockRejectedValueOnce(new PathwaysClientError(generic, 'network', [], 500))
    fireEvent.click(screen.getByRole('button', { name: 'Create Backup' }))
    expect(
      await screen.findByText(
        'The backup could not be created. The failure is recorded in the audit log.',
      ),
    ).toBeTruthy()
    expect(state.refetch).toHaveBeenCalledTimes(2)
  })

  it('reports what Verify found and refetches', async () => {
    state.verify.mockResolvedValueOnce({ point: point(1), problem: null })
    render(<BackupRecoveryWorkspace />)
    fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Verify' }))
    expect(await screen.findByText('This recovery point can be restored.')).toBeTruthy()
    state.verify.mockResolvedValueOnce({
      point: point(1, { status: 'UNAVAILABLE' }),
      problem: 'CHECKSUM_MISMATCH',
    })
    fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Verify' }))
    expect(
      await screen.findByText("This recovery point's data file has changed and cannot be trusted."),
    ).toBeTruthy()
    expect(state.refetch).toHaveBeenCalledTimes(2)
  })

  it('shows two expiring download links and replaces them for another point', async () => {
    const links = (name: string) => ({
      dataUrl: `https://storage.invalid/${name}/data`,
      manifestUrl: `https://storage.invalid/${name}/manifest`,
      expiresAt: '2026-11-12T06:02:00.000Z',
    })
    state.download.mockResolvedValueOnce(links('first')).mockResolvedValueOnce(links('second'))
    render(<BackupRecoveryWorkspace />)
    fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Download' }))
    const data = (await screen.findByRole('link', {
      name: 'Download data file',
    })) as HTMLAnchorElement
    expect(data.getAttribute('href')).toBe('https://storage.invalid/first/data')
    expect(data.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Download manifest' }).getAttribute('href')).toBe(
      'https://storage.invalid/first/manifest',
    )
    expect(screen.getByText('These links expire in 2 minutes.')).toBeTruthy()
    fireEvent.click(within(rowOf(point(3).id)).getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Download data file' }).getAttribute('href')).toBe(
        'https://storage.invalid/second/data',
      ),
    )
    expect(state.refetch).not.toHaveBeenCalled()
  })

  it('hides Create Backup without backups.create and Restore without backups.restore', () => {
    state.permissions = ['backups.restore']
    render(<BackupRecoveryWorkspace />)
    expect(screen.queryByRole('button', { name: 'Create Backup' })).toBeNull()
    cleanup()
    state.permissions = ['backups.create']
    render(<BackupRecoveryWorkspace />)
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()
  })

  it('shows a load error with Retry, and an empty state', () => {
    state.error = true
    render(<BackupRecoveryWorkspace />)
    expect(screen.getByText('Recovery points could not be loaded.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(state.refetch).toHaveBeenCalled()
    cleanup()
    state.error = false
    state.points = []
    render(<BackupRecoveryWorkspace />)
    expect(screen.getByText('No recovery point yet')).toBeTruthy()
  })

  it('describes the file mode', () => {
    render(<BackupRecoveryWorkspace />)
    expect(screen.getByText(/record which uploaded files existed/)).toBeTruthy()
    cleanup()
    state.fileMode = 'copy'
    render(<BackupRecoveryWorkspace />)
    expect(screen.getByText('New recovery points also copy every uploaded file.')).toBeTruthy()
  })

  describe('restore', () => {
    const pre = '79300000-0000-4000-8000-000000000098'
    const openRestore = () => {
      fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Restore' }))
      fireEvent.change(screen.getByLabelText('Type ORG1 to confirm'), { target: { value: 'ORG1' } })
      return within(screen.getByRole('dialog')).getByRole('button', { name: /^Restor/ })
    }

    it('restores after the typed code, closes, reports and refetches', async () => {
      state.restore.mockResolvedValueOnce({
        point: point(1),
        preRestorePointId: pre,
        rowCounts: {},
        filesRestored: 2,
      })
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(openRestore())
      await waitFor(() =>
        expect(state.restore).toHaveBeenCalledWith(point(1).id, { organizationCode: 'ORG1' }),
      )
      expect(
        await screen.findByText(
          /A recovery point of the data before the restore was saved first\. 2 files copied back\./,
        ),
      ).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(state.refetch).toHaveBeenCalled()
    })

    it('restores once on a double click', async () => {
      state.restore.mockReturnValue(new Promise(() => undefined))
      render(<BackupRecoveryWorkspace />)
      const confirm = openRestore()
      fireEvent.click(confirm)
      fireEvent.click(confirm)
      await waitFor(() => expect(state.restore).toHaveBeenCalledTimes(1))
    })

    it('keeps the dialog open with the refusal and refetches', async () => {
      state.restore.mockRejectedValueOnce(
        new PathwaysClientError(recoveryPointProblemMessages.FILE_MISSING, 'network', [], 409),
      )
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(openRestore())
      const dialog = await screen.findByRole('dialog')
      expect(
        await within(dialog).findByText(recoveryPointProblemMessages.FILE_MISSING),
      ).toBeTruthy()
      expect(state.refetch).toHaveBeenCalled()
    })

    it.each([
      [
        new PathwaysClientError('The organization code does not match.', 'invalid', [], 400),
        'The organization code does not match.',
      ],
      [
        new PathwaysClientError(generic, 'network', [], 500),
        'The restore failed and your data was not changed. The failure is recorded in the audit log.',
      ],
      [new TypeError('fetch failed'), /could not be confirmed/],
    ])('shows %s in the open dialog', async (error, text) => {
      state.restore.mockRejectedValueOnce(error)
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(openRestore())
      const alert = await within(await screen.findByRole('dialog')).findByRole('alert')
      expect(alert.textContent).toMatch(text)
    })

    it('keeps the dialog open while a restore runs, so its error is never lost', async () => {
      let reject: (reason: unknown) => void = () => undefined
      state.restore.mockReturnValue(
        new Promise((_, fail) => {
          reject = fail
        }),
      )
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(openRestore())
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('dialog')).toBeTruthy()
      reject(new PathwaysClientError(generic, 'network', [], 500))
      const alert = await within(screen.getByRole('dialog')).findByRole('alert')
      expect(alert.textContent).toMatch(/restore failed and your data was not changed/)
    })

    it('clears the error when the dialog closes', async () => {
      state.restore.mockRejectedValueOnce(new PathwaysClientError(generic, 'network', [], 500))
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(openRestore())
      await within(await screen.findByRole('dialog')).findByRole('alert')
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Restore' }))
      expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull()
    })
  })
})
