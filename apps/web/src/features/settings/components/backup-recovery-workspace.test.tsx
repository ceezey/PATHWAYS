/* @vitest-environment jsdom */

import { PathwaysClientError } from '@/lib/api/core/request'
import { BeneficiaryStepUpError } from '@/lib/auth/beneficiary-step-up'
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
  stepUpStatus: vi.fn(),
  verifyCode: vi.fn(),
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
vi.mock('@/lib/auth/beneficiary-step-up', async (original) => ({
  ...(await original<typeof import('@/lib/auth/beneficiary-step-up')>()),
  getBeneficiaryStepUpStatus: state.stepUpStatus,
  verifyBeneficiaryStepUp: state.verifyCode,
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
    state.stepUpStatus.mockResolvedValue({ fresh: true, method: 'TOTP' })
    state.verifyCode.mockResolvedValue({ fresh: true, method: 'TOTP' })
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
    expect(rowOf(point(1).id).getAttribute('aria-current')).toBe('true')
    expect(rowOf(point(1).id).className).toContain('bg-success-subtle')
    state.verify.mockResolvedValueOnce({
      point: point(1, { status: 'UNAVAILABLE' }),
      problem: 'CHECKSUM_MISMATCH',
    })
    fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Verify' }))
    expect(
      await screen.findByText("This recovery point's data file has changed and cannot be trusted."),
    ).toBeTruthy()
    expect(rowOf(point(1).id).className).toContain('bg-danger-subtle')
    expect(state.refetch).toHaveBeenCalledTimes(2)
  })

  describe('download', () => {
    const PASS = 'correct horse battery'
    const links = (name: string) => ({
      dataUrl: `https://storage.invalid/${name}/data`,
      manifestUrl: `https://storage.invalid/${name}/manifest`,
      expiresAt: '2026-11-12T06:02:00.000Z',
    })
    const stepUpRequired = () =>
      new PathwaysClientError('Forbidden', 'forbidden', [], 403, false, 'STEP_UP_TOTP_REQUIRED')
    const openDownload = (index = 1) =>
      fireEvent.click(within(rowOf(point(index).id)).getByRole('button', { name: 'Download' }))
    const passphraseField = () =>
      screen.getByLabelText('Passphrase (at least 12 characters)') as HTMLInputElement
    const againField = () => screen.getByLabelText('Type the passphrase again') as HTMLInputElement
    const fill = (passphrase: string, again = passphrase) => {
      fireEvent.change(passphraseField(), { target: { value: passphrase } })
      fireEvent.change(againField(), { target: { value: again } })
    }
    const confirm = () =>
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Download',
      }) as HTMLButtonElement
    const codeBox = () => screen.getByRole('textbox', { name: 'Digit 1 of 6' }) as HTMLInputElement
    const typeCode = () => fireEvent.change(codeBox(), { target: { value: '123456' } })

    it('opens a dialog and asks for a passphrase twice before any request', async () => {
      render(<BackupRecoveryWorkspace />)
      openDownload()
      expect(state.download).not.toHaveBeenCalled()
      expect(
        within(screen.getByRole('dialog')).getByText(
          'Download the recovery point from Nov 12, 2026, 2:00 PM?',
        ),
      ).toBeTruthy()
      expect(passphraseField().type).toBe('password')
      expect(againField().type).toBe('password')
      fill('a'.repeat(11))
      expect(confirm().disabled).toBe(true)
      fill(PASS, `${PASS}x`)
      expect(screen.getByText('The passphrases do not match.')).toBeTruthy()
      expect(confirm().disabled).toBe(true)
      fill(PASS)
      await waitFor(() => expect(confirm().disabled).toBe(false))
      expect(screen.queryByText('The passphrases do not match.')).toBeNull()
    })

    it('sends the passphrase and shows the two encrypted links with a fresh authenticator', async () => {
      state.download.mockResolvedValueOnce(links('first')).mockResolvedValueOnce(links('second'))
      render(<BackupRecoveryWorkspace />)
      openDownload()
      fill(PASS)
      await waitFor(() => expect(confirm().disabled).toBe(false))
      expect(screen.queryByRole('group', { name: 'Authenticator code' })).toBeNull()
      fireEvent.click(confirm())
      const data = (await screen.findByRole('link', {
        name: 'Download data file (encrypted)',
      })) as HTMLAnchorElement
      expect(state.download).toHaveBeenCalledWith(point(1).id, { passphrase: PASS })
      expect(state.verifyCode).not.toHaveBeenCalled()
      expect(data.getAttribute('href')).toBe('https://storage.invalid/first/data')
      expect(data.getAttribute('rel')).toBe('noopener noreferrer')
      expect(
        screen.getByRole('link', { name: 'Download manifest (encrypted)' }).getAttribute('href'),
      ).toBe('https://storage.invalid/first/manifest')
      expect(screen.getByText('These links expire in 2 minutes.')).toBeTruthy()
      expect(screen.queryByRole('dialog')).toBeNull()
      openDownload(3)
      expect(passphraseField().value).toBe('')
      expect(againField().value).toBe('')
      fill(PASS)
      await waitFor(() => expect(confirm().disabled).toBe(false))
      fireEvent.click(confirm())
      await waitFor(() =>
        expect(
          screen.getByRole('link', { name: 'Download data file (encrypted)' }).getAttribute('href'),
        ).toBe('https://storage.invalid/second/data'),
      )
    })

    it('verifies a typed authenticator code before the request when none is fresh', async () => {
      state.stepUpStatus.mockResolvedValue({ fresh: false, method: null })
      state.download.mockResolvedValueOnce(links('first'))
      render(<BackupRecoveryWorkspace />)
      openDownload()
      fill(PASS)
      expect(await screen.findByRole('group', { name: 'Authenticator code' })).toBeTruthy()
      expect(confirm().disabled).toBe(true)
      typeCode()
      expect(confirm().disabled).toBe(false)
      fireEvent.click(confirm())
      await screen.findByRole('link', { name: 'Download data file (encrypted)' })
      expect(state.verifyCode).toHaveBeenCalledWith('123456')
      expect(state.verifyCode.mock.invocationCallOrder[0]).toBeLessThan(
        state.download.mock.invocationCallOrder[0] as number,
      )
    })

    it('makes no request when the code is rejected, and keeps the passphrase', async () => {
      state.stepUpStatus.mockResolvedValue({ fresh: false, method: null })
      state.verifyCode.mockRejectedValueOnce(
        new BeneficiaryStepUpError('The code was not accepted.', 'rejected'),
      )
      render(<BackupRecoveryWorkspace />)
      openDownload()
      fill(PASS)
      await screen.findByRole('group', { name: 'Authenticator code' })
      typeCode()
      fireEvent.click(confirm())
      expect((await screen.findByRole('alert')).textContent).toBe(
        'The code was not accepted. Try the next authenticator code.',
      )
      expect(state.download).not.toHaveBeenCalled()
      expect(passphraseField().value).toBe(PASS)
      expect(againField().value).toBe(PASS)
      await waitFor(() => expect(codeBox().value).toBe(''))
    })

    it('says so when the verification service cannot be reached', async () => {
      state.stepUpStatus.mockRejectedValue(new Error('offline'))
      state.verifyCode.mockRejectedValueOnce(
        new BeneficiaryStepUpError('The verification service could not be reached.', 'unavailable'),
      )
      render(<BackupRecoveryWorkspace />)
      openDownload()
      fill(PASS)
      await screen.findByRole('group', { name: 'Authenticator code' })
      typeCode()
      fireEvent.click(confirm())
      expect((await screen.findByRole('alert')).textContent).toBe(
        'The verification service could not be reached. Check your connection and try again.',
      )
      expect(state.download).not.toHaveBeenCalled()
      expect(passphraseField().value).toBe(PASS)
    })

    it('shows the code field and keeps the passphrase when the API asks for a fresh code', async () => {
      state.download.mockRejectedValueOnce(stepUpRequired())
      render(<BackupRecoveryWorkspace />)
      openDownload()
      fill(PASS)
      await waitFor(() => expect(confirm().disabled).toBe(false))
      fireEvent.click(confirm())
      expect(await screen.findByRole('group', { name: 'Authenticator code' })).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toBe(
        'Enter the code from your authenticator app to continue.',
      )
      expect(passphraseField().value).toBe(PASS)
      expect(againField().value).toBe(PASS)
      state.download.mockResolvedValueOnce(links('first'))
      typeCode()
      fireEvent.click(confirm())
      await screen.findByRole('link', { name: 'Download data file (encrypted)' })
      expect(state.verifyCode).toHaveBeenCalledWith('123456')
      expect(state.download).toHaveBeenLastCalledWith(point(1).id, { passphrase: PASS })
    })

    it('clears the passphrase fields when the dialog closes', async () => {
      render(<BackupRecoveryWorkspace />)
      openDownload()
      fill(PASS)
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      openDownload()
      expect(passphraseField().value).toBe('')
      expect(againField().value).toBe('')
    })
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
    const openRestore = async () => {
      fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Restore' }))
      fireEvent.change(screen.getByLabelText('Type ORG1 to confirm'), { target: { value: 'ORG1' } })
      const confirm = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^Restor/,
      }) as HTMLButtonElement
      await waitFor(() => expect(confirm.disabled).toBe(false))
      return confirm
    }

    it('restores after the typed code, closes, reports and refetches', async () => {
      state.restore.mockResolvedValueOnce({
        point: point(1),
        preRestorePointId: pre,
        rowCounts: {},
        filesRestored: 2,
      })
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(await openRestore())
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

    it('verifies a typed authenticator code before the restore request when none is fresh', async () => {
      state.stepUpStatus.mockResolvedValue({ fresh: false, method: null })
      state.restore.mockResolvedValueOnce({
        point: point(1),
        preRestorePointId: pre,
        rowCounts: {},
        filesRestored: 0,
      })
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Restore' }))
      fireEvent.change(screen.getByLabelText('Type ORG1 to confirm'), { target: { value: 'ORG1' } })
      await screen.findByRole('group', { name: 'Authenticator code' })
      const confirm = within(screen.getByRole('dialog')).getByRole('button', {
        name: /^Restor/,
      }) as HTMLButtonElement
      expect(confirm.disabled).toBe(true)
      fireEvent.change(screen.getByRole('textbox', { name: 'Digit 1 of 6' }), {
        target: { value: '123456' },
      })
      fireEvent.click(confirm)
      await waitFor(() =>
        expect(state.restore).toHaveBeenCalledWith(point(1).id, { organizationCode: 'ORG1' }),
      )
      expect(state.verifyCode).toHaveBeenCalledWith('123456')
      expect(state.verifyCode.mock.invocationCallOrder[0]).toBeLessThan(
        state.restore.mock.invocationCallOrder[0] as number,
      )
    })

    it('restores once on a double click', async () => {
      state.restore.mockReturnValue(new Promise(() => undefined))
      render(<BackupRecoveryWorkspace />)
      const confirm = await openRestore()
      fireEvent.click(confirm)
      fireEvent.click(confirm)
      await waitFor(() => expect(state.restore).toHaveBeenCalledTimes(1))
    })

    it('keeps the dialog open with the refusal and refetches', async () => {
      state.restore.mockRejectedValueOnce(
        new PathwaysClientError(recoveryPointProblemMessages.FILE_MISSING, 'network', [], 409),
      )
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(await openRestore())
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
      fireEvent.click(await openRestore())
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
      fireEvent.click(await openRestore())
      await waitFor(() => expect(state.restore).toHaveBeenCalled())
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('dialog')).toBeTruthy()
      reject(new PathwaysClientError(generic, 'network', [], 500))
      const alert = await within(screen.getByRole('dialog')).findByRole('alert')
      expect(alert.textContent).toMatch(/restore failed and your data was not changed/)
    })

    it('clears the error when the dialog closes', async () => {
      state.restore.mockRejectedValueOnce(new PathwaysClientError(generic, 'network', [], 500))
      render(<BackupRecoveryWorkspace />)
      fireEvent.click(await openRestore())
      await within(await screen.findByRole('dialog')).findByRole('alert')
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      fireEvent.click(within(rowOf(point(1).id)).getByRole('button', { name: 'Restore' }))
      expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull()
    })
  })
})
