// @vitest-environment jsdom

// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  activity,
  api,
  makeFile,
  selectFiles,
  useProofDialogHarness,
} from './activity-proof-dialog.harness'

import type { Activity } from '@/types/pathways'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActivityProofDialog } from './activity-proof-dialog'

useProofDialogHarness()

describe('ActivityProofDialog progress suggestion', () => {
  const withTarget = (extra: Record<string, unknown> = {}) =>
    ({
      ...activity,
      targetBeneficiaries: 100,
      beneficiariesReached: 20,
      progress: 10,
      ...extra,
    }) as unknown as Activity
  const show = (a: Activity) =>
    render(<ActivityProofDialog activity={a} onOpenChange={vi.fn()} onSubmitted={vi.fn()} open />)
  const progressInput = () => screen.getByLabelText('Progress (%)') as HTMLInputElement
  const bar = () => screen.getByRole('progressbar').getAttribute('aria-valuenow')
  const manual = (extra: Record<string, unknown> = {}) =>
    withTarget({ targetBeneficiaries: null, ...extra })
  const session = (value: string) =>
    fireEvent.change(screen.getByLabelText(/Beneficiaries reached this session/), {
      target: { value },
    })

  it('derives read-only progress from approved plus session beneficiaries', () => {
    show(withTarget())
    expect(bar()).toBe('20')
    session('5')
    expect(bar()).toBe('25')
    expect(screen.getByText('Progress 25%')).toBeTruthy()
    expect(screen.queryByLabelText('Progress (%)')).toBeNull()
    expect(screen.queryByText(/Suggested from beneficiaries/)).toBeNull()
  })

  it('never auto-fills 100 (caps the suggestion at 99)', () => {
    show(withTarget())
    session('500')
    expect(bar()).toBe('99')
  })

  it('keeps a manual value without a target', () => {
    show(manual())
    fireEvent.change(progressInput(), { target: { value: '60' } })
    session('30')
    expect(progressInput().value).toBe('60')
  })

  it('never suggests below the current progress', () => {
    show(withTarget({ progress: 70 }))
    expect(bar()).toBe('70')
    session('5')
    expect(bar()).toBe('70')
  })

  it('offers no suggestion when the target is 0 or missing', () => {
    show(withTarget({ targetBeneficiaries: 0 }))
    expect(progressInput().value).toBe('10')
    expect(screen.queryByRole('button', { name: /Use suggestion/ })).toBeNull()
    cleanup()
    show(withTarget({ targetBeneficiaries: null }))
    expect(screen.queryByRole('button', { name: /Use suggestion/ })).toBeNull()
  })

  it('does not suggest in resume mode and locks the stored progress', () => {
    show(
      withTarget({
        updateNotes: [
          {
            id: 'u1',
            note: 'n',
            progress: 7,
            beneficiariesReachedThisSession: null,
            status: 'Submitted',
            proofIncomplete: true,
            resumeClientUpdateId: 'rc',
          },
        ],
      }),
    )
    expect(progressInput().value).toBe('7')
    expect(progressInput().disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Use suggestion/ })).toBeNull()
  })

  it('sends the suggested progress as progressPercent on reserve', async () => {
    api.reserveActivityProofUpload.mockRejectedValue(new Error('stop'))
    show(withTarget())
    session('5')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), { target: { value: 'done' } })
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(api.reserveActivityProofUpload).toHaveBeenCalledWith(
        expect.objectContaining({ progressPercent: 25, beneficiariesReachedThisSession: 5 }),
      ),
    )
  })

  it('lets the officer explicitly complete a target-based activity at 100%', async () => {
    api.reserveActivityProofUpload.mockRejectedValue(new Error('stop'))
    show(withTarget({ beneficiariesReached: 100, progress: 99 }))
    expect(bar()).toBe('99')
    fireEvent.click(screen.getByLabelText(/This proof completes the activity/))
    expect(bar()).toBe('100')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), { target: { value: 'done' } })
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(api.reserveActivityProofUpload).toHaveBeenCalledWith(
        expect.objectContaining({ progressPercent: 100 }),
      ),
    )
  })

  const submitWith = async (value: string) => {
    show(manual())
    fireEvent.change(progressInput(), { target: { value } })
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), { target: { value: 'done' } })
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
  }

  it.each(['', '101', '-1', '12.5'])(
    'rejects invalid progress %j without reserving',
    async (value) => {
      await submitWith(value)
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Progress must be a whole number from 0 to 100')
      expect(progressInput().getAttribute('aria-invalid')).toBe('true')
      expect(progressInput().getAttribute('aria-describedby')).toContain(
        'activity-proof-progress-error',
      )
      expect(alert.id).toBe('activity-proof-progress-error')
      expect(api.reserveActivityProofUpload).not.toHaveBeenCalled()
    },
  )

  it('sends a manual value of 60 as progressPercent', async () => {
    api.reserveActivityProofUpload.mockRejectedValue(new Error('stop'))
    await submitWith('60')
    await waitFor(() =>
      expect(api.reserveActivityProofUpload).toHaveBeenCalledWith(
        expect.objectContaining({ progressPercent: 60 }),
      ),
    )
  })

  it('shows no completion warning at 100', () => {
    show(manual())
    fireEvent.change(progressInput(), { target: { value: '100' } })
    expect(screen.queryByText(/marks this activity Completed/)).toBeNull()
  })

  it('shows a non-blocking note below current progress', () => {
    show(manual({ progress: 50 }))
    fireEvent.change(progressInput(), { target: { value: '30' } })
    expect(screen.getByText('This is lower than the current progress (50%).')).toBeTruthy()
  })

  it('resume sends the stored non-zero progress exactly', async () => {
    api.reserveActivityProofUpload.mockRejectedValue(new Error('stop'))
    show(
      withTarget({
        updateNotes: [
          {
            id: 'u1',
            note: 'n',
            progress: 7,
            beneficiariesReachedThisSession: null,
            status: 'Submitted',
            proofIncomplete: true,
            resumeClientUpdateId: 'rc',
          },
        ],
      }),
    )
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(api.reserveActivityProofUpload).toHaveBeenCalledWith(
        expect.objectContaining({ progressPercent: 7, clientUpdateId: 'rc' }),
      ),
    )
  })
})
