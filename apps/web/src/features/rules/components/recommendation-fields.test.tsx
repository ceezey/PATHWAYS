/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Rec } from '../rules.utils'
import { RecommendationFields } from './recommendation-fields'

afterEach(cleanup)

const openLibrary = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Choose from recommendation library' }))
const copyButtons = () =>
  screen.queryAllByRole('button', {
    name: 'Copy recommendation to this rule',
  }) as HTMLButtonElement[]

describe('RecommendationFields library', () => {
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
    expect(copyButtons()).toHaveLength(0)
    openLibrary()
    expect(copyButtons()).toHaveLength(1)
    expect(screen.getByRole('listitem').textContent).toBe('aCopy recommendation to this rule')
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
  it('allows the tenth recommendation and then disables adding and copying from the library', () => {
    render(<Harness initial={recsOf(9)} library={[rec(50)]} />)
    expect(add().disabled).toBe(false)
    openLibrary()
    expect(copyButtons()[0]?.disabled).toBe(false)
    fireEvent.click(add())
    expect(latest).toHaveLength(10)
    expect(add().disabled).toBe(true)
    expect(copyButtons()[0]?.disabled).toBe(true)
  })
  it('keeps the cap when ten recommendations are already present', () => {
    render(<Harness initial={recsOf(10)} library={[rec(50)]} />)
    expect(add().disabled).toBe(true)
    openLibrary()
    expect(copyButtons()[0]?.disabled).toBe(true)
    expect(screen.getByText('Recommendation library')).toBeTruthy()
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
  it('replaces a single blank recommendation with a copied one, collapses it and closes the library', () => {
    render(<Harness initial={[rec(1, '', '')]} library={[rec(7)]} />)
    openLibrary()
    fireEvent.click(copyButtons()[0] as HTMLElement)
    expect(screen.getByRole('button', { name: 'Choose from recommendation library' })).toBeTruthy()
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
  it('shows a loading note and an empty note in the open library', () => {
    const { rerender } = render(
      <RecommendationFields hasRule libraryPending onRecs={vi.fn()} recs={[rec(1)]} />,
    )
    openLibrary()
    expect(screen.getByText(/^Loading saved recommendations/)).toBeTruthy()
    rerender(<RecommendationFields hasRule onRecs={vi.fn()} recs={[rec(1)]} />)
    expect(screen.getByText(/^No other saved recommendations/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide recommendation library' }))
    expect(screen.queryByText(/^No other saved recommendations/)).toBeNull()
  })
  it('hides the Add button on request and reports user edits and removals', () => {
    const onUserEdit = vi.fn()
    render(
      <RecommendationFields
        hasRule={false}
        hideAddButton
        onRecs={vi.fn()}
        onUserEdit={onUserEdit}
        recs={[rec(1, '', ''), rec(2)]}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Add recommendation' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Recommendation title'), { target: { value: 'x' } })
    expect(onUserEdit).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove recommendation' }))
    expect(onUserEdit).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Remove recommendation 2' }))
    expect(onUserEdit).toHaveBeenCalledTimes(3)
  })
})

describe('RecommendationFields editing', () => {
  it('stays open while typing the first letter of the response until Done', () => {
    render(<Harness initial={[{ id: 'r1', title: 'Check', text: '' }]} />)
    fireEvent.change(screen.getByLabelText('Suggested response'), { target: { value: 'f' } })
    expect((screen.getByLabelText('Suggested response') as HTMLTextAreaElement).value).toBe('f')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByLabelText('Suggested response')).toBeNull()
    expect(latest[0]).toMatchObject({ title: 'Check', text: 'f' })
  })
})
