// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PageHeadingEditor } from './page-heading-editor'
// These tests cover the hidden state of controls behind UNFINISHED_CONTROLS_UI_ENABLED.
vi.mock('@/constants/feature-flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/feature-flags')>()),
  UNFINISHED_CONTROLS_UI_ENABLED: false,
}))

afterEach(() => {
  cleanup()
})

// The heading editor has no server endpoint yet, so it is hidden behind
// UNFINISHED_CONTROLS_UI_ENABLED (docs/deferred-features.md).
describe('PageHeadingEditor', () => {
  it('renders nothing while unfinished controls are hidden', () => {
    const { container } = render(<PageHeadingEditor labelKey="moduleProjects" title="Projects" />)

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('button', { name: 'Edit Projects page heading' })).toBeNull()
    expect(screen.queryByText('Not available yet')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
