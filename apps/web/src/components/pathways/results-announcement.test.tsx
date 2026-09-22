// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResultsAnnouncement } from './results-announcement'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ResultsAnnouncement', () => {
  it('announces only the final settled result message without moving focus', async () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <>
        <label htmlFor="search">Search</label>
        <input id="search" />
        <ResultsAnnouncement
          message="4 beneficiary records match the current filters."
          settleKey="first"
          settleMilliseconds={300}
        />
      </>,
    )
    const search = screen.getByRole('textbox', { name: 'Search' })
    const status = screen.getByRole('status', { name: 'Filtered results' })
    search.focus()

    rerender(
      <>
        <label htmlFor="search">Search</label>
        <input id="search" />
        <ResultsAnnouncement
          message="2 beneficiary records match the current filters."
          settleKey="second"
          settleMilliseconds={300}
        />
      </>,
    )
    rerender(
      <>
        <label htmlFor="search">Search</label>
        <input id="search" />
        <ResultsAnnouncement
          message="No beneficiary records match the current filters."
          settleKey="final"
          settleMilliseconds={300}
        />
      </>,
    )

    expect(status.textContent).toBe('')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(status.textContent).toBe('No beneficiary records match the current filters.')
    expect(document.activeElement).toBe(search)
  })
})
