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
