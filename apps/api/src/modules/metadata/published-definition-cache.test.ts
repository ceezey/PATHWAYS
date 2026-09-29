import { describe, expect, it } from 'vitest'
import { PublishedDefinitionCache } from './published-definition-cache'

describe('bounded published definition payloads', () => {
  it('returns independent copies and expires by monotonic age', () => {
    let now = 0
    const cache = new PublishedDefinitionCache<{ fields: string[] }>(() => now)
    cache.write('one', 'form', { fields: ['a'] })
    const copy = cache.read('one')
    if (!copy) throw new Error('Expected cached fixture')
    copy.fields.push('mutated')
    expect(cache.read('one')).toEqual({ fields: ['a'] })
    now = 30_000
    expect(cache.read('one')).toBeUndefined()
  })
  it('evicts by entry count and total bytes, rejects oversized entries and invalidates every actor variant', () => {
    const cache = new PublishedDefinitionCache<string>(() => 0, {
      ttlMs: 100,
      entries: 2,
      entryBytes: 20,
      totalBytes: 20,
    })
    cache.write('a', 'same', '12345')
    cache.write('b', 'other', '12345')
    cache.write('c', 'same', '12345')
    expect(cache.read('a')).toBeUndefined()
    expect(cache.read('b')).toBe('12345')
    cache.write('big', 'same', 'x'.repeat(30))
    expect(cache.read('big')).toBeUndefined()
    cache.evictForm('same')
    expect(cache.read('c')).toBeUndefined()
    expect(cache.read('b')).toBe('12345')
  })
})
