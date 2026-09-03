/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PrototypeLabelsProvider } from '@/providers/prototype-labels-provider'

import { CollectionWorkspace } from './collection-workspace'

afterEach(() => cleanup())

const renderImportWorkspace = () =>
  render(
    <PrototypeLabelsProvider>
      <CollectionWorkspace initialMode="import" initialView="import" />
    </PrototypeLabelsProvider>,
  )

const csvFile = (name: string, readText: () => Promise<string>) => {
  const file = new File(['test'], name, { type: 'text/csv' })
  Object.defineProperty(file, 'text', { configurable: true, value: readText })
  return file
}

describe('collection import workspace', () => {
  it('uses one visible labelled chooser and reports reading, completion, and mapping readiness', async () => {
    renderImportWorkspace()

    const chooser = screen.getByLabelText('Source file') as HTMLInputElement
    const helpId = chooser.getAttribute('aria-describedby')
    expect(chooser.type).toBe('file')
    expect(chooser.className).not.toContain('sr-only')
    expect(helpId).toBe('collection-import-file-help')
    expect(document.getElementById(helpId ?? '')?.textContent).toContain(
      'It is read locally in this browser',
    )

    chooser.focus()
    expect(document.activeElement).toBe(chooser)

    let resolveText: ((value: string) => void) | undefined
    const file = csvFile(
      'valid.csv',
      () =>
        new Promise<string>((resolve) => {
          resolveText = resolve
        }),
    )
    fireEvent.change(chooser, { target: { files: [file] } })

    await waitFor(() => {
      expect(
        screen.getByText('Reading the file in this browser. Nothing is being uploaded.'),
      ).toBeTruthy()
    })
    expect(
      screen
        .getByRole('progressbar', { name: 'File reading progress' })
        .getAttribute('aria-valuenow'),
    ).toBe('28')
    expect(document.activeElement).toBe(chooser)

    await act(async () => {
      resolveText?.('beneficiary_id,attendance_status\nBEN-001,Present')
    })

    await waitFor(() => {
      expect(screen.getByText(/Preview ready for valid\.csv/)).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('All 2 source columns are resolved. You can proceed.')).toBeTruthy()
    expect(document.querySelectorAll('[aria-live]').length).toBe(1)
    expect(
      screen
        .getByRole('progressbar', { name: 'File reading progress' })
        .getAttribute('aria-valuenow'),
    ).toBe('100')
  })

  it('blocks unresolved mappings and retains prior work through a failed read and retry', async () => {
    renderImportWorkspace()

    const chooser = screen.getByLabelText('Source file') as HTMLInputElement
    fireEvent.change(chooser, {
      target: {
        files: [
          csvFile('unmapped.csv', async () => 'beneficiary_id,unknown_column\nBEN-001,value'),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByText('1 unmapped source column remains. Resolve them before proceeding.'),
      ).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(true)

    fireEvent.change(chooser, {
      target: {
        files: [csvFile('valid.csv', async () => 'beneficiary_id\nBEN-001')],
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/Preview ready for valid\.csv/)).toBeTruthy()
    })
    expect(screen.getByText('BEN-001')).toBeTruthy()

    const transientRead = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Temporary read failure.'))
      .mockResolvedValue('beneficiary_id\nBEN-002')
    chooser.focus()
    fireEvent.change(chooser, {
      target: { files: [csvFile('retry.csv', transientRead)] },
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          /Temporary read failure\..*previous preview and mapping work are retained/i,
        ),
      ).toBeTruthy()
    })
    expect(document.activeElement).toBe(chooser)
    expect(screen.getByText('BEN-001')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Retry reading file' }))
    await waitFor(() => {
      expect(screen.getByText(/Preview ready for retry\.csv/)).toBeTruthy()
    })
    expect(transientRead).toHaveBeenCalledTimes(2)
    expect(screen.getByText('BEN-002')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Proceed' }).hasAttribute('disabled')).toBe(false)
  })
})

describe('collection field selection', () => {
  it('exposes and updates exactly one selected field with a visible cue', () => {
    render(
      <PrototypeLabelsProvider>
        <CollectionWorkspace initialMode="scratch" initialView="builder" />
      </PrototypeLabelsProvider>,
    )

    const choices = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
    expect(choices.filter((choice) => choice.getAttribute('aria-pressed') === 'true')).toHaveLength(
      1,
    )
    expect(choices[0].textContent).toContain('Selected')

    fireEvent.click(choices[1])
    expect(choices[0].getAttribute('aria-pressed')).toBe('false')
    expect(choices[1].getAttribute('aria-pressed')).toBe('true')
    expect(choices[1].textContent).toContain('Selected')
  })

  it('requires a contextual confirmation before deleting a field and restores useful focus', async () => {
    render(
      <PrototypeLabelsProvider>
        <CollectionWorkspace initialMode="scratch" initialView="builder" />
      </PrototypeLabelsProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete Age group' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Age group?' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(dialog.textContent).toContain('Field code: beneficiary_age_group')
    await waitFor(() => expect(document.activeElement).toBe(cancel))

    fireEvent.click(cancel)
    expect(screen.getByRole('button', { name: 'Delete Age group' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Age group' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete Age group' }),
    )
    expect(screen.queryByRole('button', { name: 'Delete Age group' })).toBeNull()
    await waitFor(() =>
      expect(document.activeElement?.id).toBe('collection-field-choice-field-beneficiary-id'),
    )
  })
})
