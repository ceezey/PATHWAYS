/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ImportProcessingPanel, type ImportProcessingState } from './import-processing-panel'

const progress = { handled: 100, total: 250, processed: 100, unprocessed: 0, failed: 0 }

afterEach(cleanup)

describe('ImportProcessingPanel focus restoration', () => {
  it('focuses Stop when Resume processing restarts a stopped run', () => {
    const view = render(
      <ImportProcessingPanel
        onResume={() => {}}
        onStop={() => {}}
        progress={progress}
        state="stopped"
      />,
    )
    screen.getByRole('button', { name: 'Resume processing' }).focus()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resume processing' }))

    view.rerender(
      <ImportProcessingPanel
        onResume={() => {}}
        onStop={() => {}}
        progress={progress}
        state="running"
      />,
    )

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop processing' }))
  })

  it('focuses the panel heading when processing completes while focus was inside the panel', () => {
    const view = render(
      <ImportProcessingPanel
        onResume={() => {}}
        onStop={() => {}}
        progress={progress}
        state="running"
      />,
    )
    screen.getByRole('button', { name: 'Stop processing' }).focus()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop processing' }))

    view.rerender(
      <ImportProcessingPanel
        onResume={() => {}}
        onStop={() => {}}
        progress={{ ...progress, handled: 250, processed: 250 }}
        state="complete"
      />,
    )

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Import processing' }))
  })

  it('leaves focus alone on completion when focus was never inside the panel', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside)

    const view = render(
      <ImportProcessingPanel
        onResume={() => {}}
        onStop={() => {}}
        progress={progress}
        state="running"
      />,
    )
    expect(document.activeElement).toBe(outside)

    view.rerender(
      <ImportProcessingPanel
        onResume={() => {}}
        onStop={() => {}}
        progress={{ ...progress, handled: 250, processed: 250 }}
        state="complete"
      />,
    )

    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it.each<ImportProcessingState>(['stopped', 'failed'])(
    'still focuses Resume when a %s run restarts, unchanged by the new Stop-focus behavior',
    (fromState) => {
      const view = render(
        <ImportProcessingPanel
          onResume={() => {}}
          onStop={() => {}}
          progress={progress}
          state="running"
        />,
      )

      view.rerender(
        <ImportProcessingPanel
          onResume={() => {}}
          onStop={() => {}}
          progress={progress}
          state={fromState}
        />,
      )

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resume processing' }))
    },
  )
})
