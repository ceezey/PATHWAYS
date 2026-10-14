/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecommendationFields } from './recommendation-fields'

afterEach(cleanup)

describe('RecommendationFields reuse list', () => {
  it('offers a saved recommendation once, unless the rule already has the same title and text', () => {
    render(
      <RecommendationFields
        hasRule
        recs={[{ id: 'r1', title: 'ab', text: 'c' }]}
        onRecs={vi.fn()}
        library={[
          { id: 'l1', title: 'ab', text: 'c' },
          { id: 'l2', title: 'a', text: 'bc' },
          { id: 'l3', title: 'a', text: 'bc' },
        ]}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Reuse' })).toHaveLength(1)
    expect(screen.getByRole('listitem').textContent).toBe('aReuse')
  })
})
