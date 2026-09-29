import { describe, expect, it } from 'vitest'
import { type RuleNode, metricCellSchema, parseRuleTree } from './rules-validation'
const condition = (id = 'a') => ({
  kind: 'CONDITION',
  id,
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '0',
})
describe('bounded typed rules authoring', () => {
  it('retains exact decimal thresholds and treats unavailable metrics separately from zero', () => {
    expect(
      parseRuleTree({
        ...condition(),
        metric: 'INDICATOR_CURRENT_VALUE',
        indicatorId: '10000000-0000-4000-8000-000000000001',
        threshold: '9007199254740.0001',
      }),
    ).toMatchObject({ threshold: '9007199254740.0001' })
    expect(metricCellSchema.parse({ state: 'ZERO', value: '0', reason: null })).toEqual({
      state: 'ZERO',
      value: '0',
      reason: null,
    })
    expect(
      metricCellSchema.parse({ state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' }).value,
    ).toBeNull()
    expect(
      metricCellSchema.safeParse({ state: 'MISSING', value: '0', reason: 'NO_MEASUREMENT' })
        .success,
    ).toBe(false)
  })
  it('rejects arbitrary SQL, extra bindings, reversed bounds and invalid metric domains', () => {
    for (const value of [
      { ...condition(), sql: 'select private' },
      { ...condition(), indicatorId: '10000000-0000-4000-8000-000000000001' },
      { ...condition(), operator: 'BETWEEN', threshold: '5', thresholdMaximum: '1' },
      { ...condition(), threshold: '1.5' },
      { ...condition(), metric: 'ACTIVITY_COMPLETION_PERCENT', threshold: '101' },
    ])
      expect(() => parseRuleTree(value)).toThrow()
  })
  it('accepts exactly four groups and thirty-two distinct leaves while rejecting excess and cycles', () => {
    const leaves = Array.from({ length: 32 }, (_, index) => condition(`c${index}`))
    expect(parseRuleTree({ kind: 'GROUP', mode: 'AND', children: leaves })).toMatchObject({
      children: expect.any(Array),
    })
    expect(() =>
      parseRuleTree({ kind: 'GROUP', mode: 'AND', children: [...leaves, condition('overflow')] }),
    ).toThrow()
    let tree: unknown = condition()
    for (let depth = 0; depth < 4; depth++) tree = { kind: 'GROUP', mode: 'AND', children: [tree] }
    expect(() => parseRuleTree(tree)).not.toThrow()
    expect(() => parseRuleTree({ kind: 'GROUP', mode: 'AND', children: [tree] })).toThrow()
    const cycle: { kind: string; mode: string; children: unknown[] } = {
      kind: 'GROUP',
      mode: 'AND',
      children: [],
    }
    cycle.children.push(cycle)
    expect(() => parseRuleTree(cycle)).toThrow()
  })
})
