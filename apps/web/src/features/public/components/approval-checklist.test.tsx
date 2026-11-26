/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApprovalChecklist, publicationChecklistItems } from './approval-checklist'

describe('approval checklist', () => {
  afterEach(cleanup)
  const show = (ticked: string[]) =>
    render(
      <ApprovalChecklist
        idPrefix="check"
        items={publicationChecklistItems}
        onChange={vi.fn()}
        ticked={new Set(ticked)}
      />,
    )

  it('says why approval is disabled, with the count, and links the hint to every box', () => {
    show(['smallGroupsChecked', 'noIdentifiableMinor'])
    const hint = screen.getByRole('status')
    expect(hint.textContent).toBe('Tick every item to enable approval (2 of 4 ticked).')
    expect(hint.id).toBe('check-hint')
    for (const box of screen.getAllByRole('checkbox'))
      expect(box.getAttribute('aria-describedby')).toBe('check-hint')
    expect(screen.getAllByText('(required)', { exact: false })).toHaveLength(4)
  })

  it('confirms once every item is ticked', () => {
    show(Object.keys(publicationChecklistItems))
    expect(screen.getByRole('status').textContent).toBe('All 4 items confirmed.')
  })
})
