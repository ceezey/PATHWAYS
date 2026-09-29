// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PageHeadingEditor } from './page-heading-editor'

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
