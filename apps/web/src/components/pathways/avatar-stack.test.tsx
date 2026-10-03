/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AvatarStack } from './avatar-stack'

const member = (n: number, role = 'PROJECT_OFFICER') => ({
  userId: `u${n}`,
  fullName: `Person ${n}`,
  role,
})

describe('AvatarStack', () => {
  it('shows at most four avatars then a +N chip, with name and role labels', () => {
    render(<AvatarStack members={[1, 2, 3, 4, 5, 6].map((n) => member(n))} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('+2')).toBeTruthy()
    expect(screen.getByLabelText('Person 1, Project Officer').getAttribute('title')).toBe(
      'Person 1, Project Officer',
    )
  })

  it('renders a single avatar without a role', () => {
    render(<AvatarStack members={[{ userId: 'p', fullName: 'Maria Santos' }]} />)
    expect(screen.getByLabelText('Maria Santos').textContent).toBe('MS')
  })
})
