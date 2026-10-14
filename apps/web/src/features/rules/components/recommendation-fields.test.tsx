/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Rec } from '../rules.utils'
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

const rec = (n: number, title = `Title ${n}`, text = `Text ${n}`): Rec => ({
  id: `rec-${n}`,
  title,
  text,
})
const recsOf = (count: number) => Array.from({ length: count }, (_, i) => rec(i + 1))
let latest: Rec[] = []
function Harness({ initial, library }: { initial: Rec[]; library?: Rec[] }) {
  const [recs, setRecs] = useState(initial)
  latest = recs
  return <RecommendationFields hasRule library={library} onRecs={setRecs} recs={recs} />
}
const add = () => screen.getByRole('button', { name: 'Add recommendation' }) as HTMLButtonElement

describe('RecommendationFields list limits', () => {
  it('allows the tenth recommendation and then disables adding and hides the reuse list', () => {
    render(<Harness initial={recsOf(9)} library={[rec(50)]} />)
    expect(add().disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Reuse' })).toBeTruthy()
    fireEvent.click(add())
    expect(latest).toHaveLength(10)
    expect(add().disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Reuse' })).toBeNull()
  })
  it('keeps the cap when ten recommendations are already present', () => {
    render(<Harness initial={recsOf(10)} library={[rec(50)]} />)
    expect(add().disabled).toBe(true)
    expect(screen.queryByText('Reuse a saved recommendation')).toBeNull()
  })
  it('replaces a single blank recommendation when adding, but appends after a complete one', () => {
    render(<Harness initial={[rec(1, '', '')]} />)
    fireEvent.click(add())
    expect(latest).toHaveLength(1)
    expect(latest[0]?.id).not.toBe('rec-1')
    cleanup()
    render(<Harness initial={[rec(1)]} />)
    fireEvent.click(add())
    expect(latest).toHaveLength(2)
    expect(latest[0]).toEqual(rec(1))
  })
  it('replaces a single blank recommendation with a reused one and collapses it', () => {
    render(<Harness initial={[rec(1, '', '')]} library={[rec(7)]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reuse' }))
    expect(latest.map((item) => [item.title, item.text])).toEqual([['Title 7', 'Text 7']])
    expect(screen.queryByLabelText('Recommendation title')).toBeNull()
    expect(screen.getByText('Title 7')).toBeTruthy()
  })
  it('offers Remove only when more than one recommendation exists, in both layouts', () => {
    render(<Harness initial={[rec(1)]} />)
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    cleanup()
    render(<Harness initial={[rec(1, 'Half', '')]} />)
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    cleanup()
    render(<Harness initial={[rec(1), rec(2, 'Half', '')]} />)
    expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove recommendation 1' }))
    expect(latest.map((item) => item.id)).toEqual(['rec-2'])
  })
  it('expands a recommendation missing its title or response and collapses a complete one', () => {
    render(<Harness initial={[rec(1), rec(2, 'Only title', ''), rec(3, '', 'Only text')]} />)
    expect(screen.getAllByLabelText('Recommendation title')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^Edit recommendation/ })).toHaveLength(1)
  })
  it('limits the title to 160 and the response to 2000 characters', () => {
    render(<Harness initial={[rec(1, '', '')]} />)
    expect(screen.getByLabelText('Recommendation title').getAttribute('maxlength')).toBe('160')
    expect(screen.getByLabelText('Suggested response').getAttribute('maxlength')).toBe('2000')
  })
})
