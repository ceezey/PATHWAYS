export interface HeaderComparisonResult {
  expected: string[]
  received: string[]
  missing: string[]
  extra: string[]
  matches: boolean
}

export const compareHeaders = (expected: string[], received: string[]): HeaderComparisonResult => {
  const normalizedExpected = expected.map((header) => header.trim())
  const normalizedReceived = received.map((header) => header.trim())

  const missing = normalizedExpected.filter((header) => !normalizedReceived.includes(header))
  const extra = normalizedReceived.filter((header) => !normalizedExpected.includes(header))

  return {
    expected: normalizedExpected,
    received: normalizedReceived,
    missing,
    extra,
    matches: missing.length === 0 && extra.length === 0,
  }
}
