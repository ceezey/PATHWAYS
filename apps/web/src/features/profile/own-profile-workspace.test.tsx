/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OwnProfileWorkspace } from './own-profile-workspace'

vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ email: 'admin@example.test' }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { fullName: 'System Administrator' } }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

describe('own profile interim policy view', () => {
  it('renders verified account data read-only and exposes no mutation controls', () => {
    render(<OwnProfileWorkspace />)

    expect(screen.getByText('System Administrator')).toBeTruthy()
    expect(screen.getByText('admin@example.test')).toBeTruthy()
    expect(screen.getByText(/Profile editing is unavailable/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /save|change password/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
