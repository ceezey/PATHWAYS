/** Server-only diagnostic classification, never an authorization decision.
 * Inspect bounded own data properties only; never invoke getters, stringify the
 * provider error, log metadata/messages, or infer expiry from P2028 alone.
 */
function ownValue(value: unknown, key: string): unknown {
  try {
    return value !== null && typeof value === 'object'
      ? Object.getOwnPropertyDescriptor(value, key)?.value
      : undefined
  } catch {
    return undefined
  }
}

export function prismaDiagnosticCode(error: unknown): string {
  const code = ownValue(error, 'code')
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : ''
}

type TransactionFailure = 'ACQUISITION_TIMEOUT' | 'EXECUTION_EXPIRED' | 'UNCLASSIFIED'

export function transactionDiagnostic(error: unknown): { transactionFailure?: TransactionFailure } {
  if (prismaDiagnosticCode(error) !== 'P2028') return {}
  const detail = ownValue(ownValue(error, 'meta'), 'error')
  let transactionFailure: TransactionFailure = 'UNCLASSIFIED'
  // Pinned installed Prisma 6.19.2 shapes, verified by the loopback integration
  // test. Unknown/changed/oversized shapes remain unclassified, not guessed.
  if (typeof detail === 'string' && detail.length <= 1_024) {
    if (/^Unable to start a transaction in the given time\.?$/.test(detail)) {
      transactionFailure = 'ACQUISITION_TIMEOUT'
    } else if (
      /^Transaction already closed: A (?:query|commit|rollback) cannot be executed on an expired transaction\./.test(
        detail,
      )
    ) {
      transactionFailure = 'EXECUTION_EXPIRED'
    }
  }
  return { transactionFailure }
}
