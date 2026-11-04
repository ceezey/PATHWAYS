import { type FieldIntakeRule, isCalculatedRule, ruleFieldCodes } from '@pathways/shared'

// The breakdown fields reports count by, each group fed by any one of its codes.
export const SADDD_GROUPS = [['sex'], ['birth_date', 'age_at_registration'], ['disability_status']]

/** The breakdown groups the form has and no column feeds, by the group's first code on the form and the header suggested for it. */
export function unfedSadddFields(
  fieldCodes: ReadonlySet<string>,
  mappedCodes: ReadonlySet<string>,
  suggestions: ReadonlyMap<string, string>,
): Array<{ fieldCode: string; suggestedHeader: string | null }> {
  return SADDD_GROUPS.flatMap((group) => {
    const present = group.filter((code) => fieldCodes.has(code))
    if (present.length === 0 || present.some((code) => mappedCodes.has(code))) return []
    const suggested = present.find((code) => suggestions.has(code))
    return [
      {
        fieldCode: present[0],
        suggestedHeader: suggested === undefined ? null : (suggestions.get(suggested) ?? null),
      },
    ]
  })
}

/** The mapped codes plus each field a calculated rule fills from them; a Washington Group rule needs one question, as its calculation does. */
export function fedCodes(
  fields: readonly { code: string; rule?: FieldIntakeRule | null }[],
  mapped: Iterable<string>,
): Set<string> {
  const fed = new Set(mapped)
  const has = (code: string) => fed.has(code)
  for (const { code, rule } of fields) {
    if (!rule || !isCalculatedRule(rule)) continue
    const inputs = ruleFieldCodes(rule)
    if (rule.kind === 'WASHINGTON_GROUP_DISABILITY' ? inputs.some(has) : inputs.every(has))
      fed.add(code)
  }
  return fed
}
