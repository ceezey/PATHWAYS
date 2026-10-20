import { describe, expect, it } from 'vitest'

import { cn } from '@/lib/utils'

import { stickyTableHeadClass } from './sticky-table-head'

const base =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

describe('stickyTableHeadClass', () => {
  it('keeps the left-aligned sticky header classes the four tables rendered', () => {
    expect(stickyTableHeadClass).toBe(
      'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
    )
  })

  it('lets an alignment passed through cn replace text-left', () => {
    expect(cn(stickyTableHeadClass, 'text-center')).toBe(`${base} text-center`)
    expect(cn(stickyTableHeadClass, 'text-right')).toBe(`${base} text-right`)
  })
})
