import { describe, expect, it } from 'vitest'
import type { RuleNode } from '../rule-contract'
import { classifyAlertSeverity } from './severity-classify'
import type { ClassifyInput, SeverityBasis } from './severity-criteria'
import fixtureFile from './severity-fixtures.json'

type Fixture = { name: string; input: ClassifyInput; expected: SeverityBasis }
const fixtures = fixtureFile as unknown as Fixture[]

// Reverses every group's children so order-independence is checked on each fixture.
const reversed = (node: RuleNode): RuleNode =>
  node.kind === 'CONDITION' ? node : { ...node, children: node.children.map(reversed).reverse() }

describe('classifyAlertSeverity', () => {
  it('has uniquely named fixtures', () => {
    expect(new Set(fixtures.map((fixture) => fixture.name)).size).toBe(fixtures.length)
  })

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))('%s', (_, fixture) => {
    expect(classifyAlertSeverity(fixture.input)).toEqual(fixture.expected)
  })

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    'ignores child order: %s',
    (_, fixture) => {
      const input = { ...fixture.input, tree: reversed(fixture.input.tree) }
      expect(classifyAlertSeverity(input)).toEqual(fixture.expected)
    },
  )

  it('refuses a rule that did not match', () => {
    const input = structuredClone(fixtures[0].input)
    input.results = Object.fromEntries(Object.keys(input.results).map((id) => [id, 'FALSE']))
    expect(() => classifyAlertSeverity(input)).toThrow('Only a matched rule has a severity.')
  })

  it('refuses a counted condition without facts', () => {
    const input = { ...structuredClone(fixtures[0].input), facts: {} }
    expect(() => classifyAlertSeverity(input)).toThrow(/facts/)
  })
})
