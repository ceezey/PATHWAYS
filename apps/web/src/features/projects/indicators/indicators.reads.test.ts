import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const indicators = vi.hoisted(() => ({ getProjectIndicators: vi.fn() }))
const library = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/indicators', () => ({
  indicatorsClient: indicators,
  indicatorLibraryClient: library,
}))

import { useIndicatorLibraryRead, useProjectIndicatorsRead } from './indicators.reads'

const signal = new AbortController().signal

describe('indicator authorized reads', () => {
  beforeEach(() => {
    read.mockReset()
    indicators.getProjectIndicators.mockReset()
    library.list.mockReset()
  })

  it('reads the library under one key; the call site picks the enabled flag and freshness', () => {
    useIndicatorLibraryRead()
    useIndicatorLibraryRead(false, { freshness: 'summary' })
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['indicator-library', null, 'indicators.library.read'],
      ['indicator-library', null, 'indicators.library.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toEqual({})
    expect(read.mock.calls[1][5]).toEqual({ freshness: 'summary' })
    read.mock.calls[0][3](signal)
    expect(library.list).toHaveBeenCalledOnce()
  })

  it('reads the project indicator rows under one shared key with summary freshness', () => {
    useProjectIndicatorsRead('project-1')
    useProjectIndicatorsRead('project-2', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['project-indicators', 'project-1', 'indicators.read'],
      ['project-indicators', 'project-2', 'indicators.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toEqual({ freshness: 'summary' })
    read.mock.calls[0][3](signal)
    expect(indicators.getProjectIndicators).toHaveBeenCalledWith('project-1', signal)
  })
})
