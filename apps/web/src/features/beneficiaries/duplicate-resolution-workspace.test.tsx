/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DuplicateResolutionWorkspace } from './duplicate-resolution-workspace'

afterEach(cleanup)

describe('DuplicateResolutionWorkspace', () => {
  it('tells staff the matcher is unavailable instead of offering a working queue', () => {
    render(<DuplicateResolutionWorkspace />)

    expect(
      screen.getAllByText(
        'Duplicate review is unavailable until a server-backed matching and resolution service is available.',
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('No possible matches')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Merge linked profiles' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep as distinct people' })).toBeNull()
  })
})
