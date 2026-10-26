/**
 * Maps column key to field code for each column whose row-1 source code is listed, exactly and
 * case-sensitively, by one field's source names. A code claimed by two fields or two columns is skipped, and so is a field claimed by two columns.
 */
export function matchBySourceCode(
  columns: ReadonlyArray<{ key: string; sourceCode?: string }>,
  fields: ReadonlyArray<{ code: string; sourceNames?: readonly string[] | null }>,
): Map<string, string> {
  const owners = new Map<string, string[]>()
  for (const field of fields) {
    for (const name of new Set(field.sourceNames ?? [])) {
      owners.set(name, [...(owners.get(name) ?? []), field.code])
    }
  }
  const uses = new Map<string, number>()
  for (const { sourceCode } of columns) {
    if (sourceCode) uses.set(sourceCode, (uses.get(sourceCode) ?? 0) + 1)
  }
  const matched = new Map<string, string>()
  for (const { key, sourceCode } of columns) {
    const claimed = sourceCode ? owners.get(sourceCode) : undefined
    if (sourceCode && uses.get(sourceCode) === 1 && claimed?.length === 1) {
      matched.set(key, claimed[0])
    }
  }
  const perField = new Map<string, number>()
  for (const code of matched.values()) perField.set(code, (perField.get(code) ?? 0) + 1)
  return new Map([...matched].filter(([, code]) => perField.get(code) === 1))
}
