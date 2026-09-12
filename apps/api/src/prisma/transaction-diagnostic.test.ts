import { describe, expect, it, vi } from 'vitest'
import { prismaDiagnosticCode, transactionDiagnostic } from './transaction-diagnostic'

const acquisition = 'Unable to start a transaction in the given time.'
const expired =
  'Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 10000 ms, however 10200 ms passed.'
const canary = 'SYNTHETIC_SECRET_CANARY'

describe('bounded transaction diagnostics', () => {
  it('recognizes the installed acquisition shape without emitting provider properties', () => {
    const error = { code: 'P2028', meta: { error: acquisition, query: canary }, message: canary }
    expect(transactionDiagnostic(error)).toEqual({ transactionFailure: 'ACQUISITION_TIMEOUT' })
    expect(JSON.stringify(transactionDiagnostic(error))).not.toContain(canary)
  })

  it.each(['query', 'commit', 'rollback'])(
    'recognizes bounded execution expiry for %s without emitting timings or suffixes',
    (operation) => {
      expect(
        transactionDiagnostic({
          code: 'P2028',
          meta: { error: `${expired.replace('query', operation)} ${canary}` },
        }),
      ).toEqual({ transactionFailure: 'EXECUTION_EXPIRED' })
    },
  )

  it.each([
    undefined,
    null,
    true,
    42,
    {},
    [],
    acquisition.repeat(40),
    expired.repeat(20),
    `${canary}: ${acquisition}`,
    'Transaction already closed.',
    'expired transaction',
    'Unable to start a transaction in a different time.',
    `${acquisition} ${canary}`,
  ])('does not guess from missing, malformed, oversized or changed text %#', (detail) => {
    expect(transactionDiagnostic({ code: 'P2028', meta: { error: detail } })).toEqual({
      transactionFailure: 'UNCLASSIFIED',
    })
  })

  it.each([
    null,
    undefined,
    '',
    { code: 'P2010' },
    { code: 'P2024' },
    { code: canary },
    Object.create({ code: 'P2028' }),
  ])('does not add a transaction classification for a non-P2028 error %#', (error) => {
    expect(transactionDiagnostic(error)).toEqual({})
  })

  it.each(['code', 'meta', 'error'])('does not execute a %s getter', (key) => {
    const getter = vi.fn(() => {
      throw new Error(canary)
    })
    const error = { code: 'P2028', meta: { error: acquisition } }
    Object.defineProperty(key === 'error' ? error.meta : error, key, { get: getter })
    const result = transactionDiagnostic(error)
    expect(result).toEqual(key === 'code' ? {} : { transactionFailure: 'UNCLASSIFIED' })
    expect(getter).not.toHaveBeenCalled()
  })

  it('contains throwing proxies and ignores inherited metadata', () => {
    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    expect(prismaDiagnosticCode(revoked.proxy)).toBe('')
    expect(transactionDiagnostic(revoked.proxy)).toEqual({})
    expect(transactionDiagnostic({ code: 'P2028', meta: revoked.proxy })).toEqual({
      transactionFailure: 'UNCLASSIFIED',
    })
    expect(
      transactionDiagnostic({ code: 'P2028', meta: Object.create({ error: acquisition }) }),
    ).toEqual({ transactionFailure: 'UNCLASSIFIED' })
  })

  it('returns only bounded Prisma code strings, never coerces arbitrary objects', () => {
    const stringify = vi.fn(() => canary)
    expect(prismaDiagnosticCode({ code: { toString: stringify } })).toBe('')
    expect(prismaDiagnosticCode({ code: 'P2028' })).toBe('P2028')
    expect(prismaDiagnosticCode({ code: `P2028${canary}` })).toBe('')
    expect(stringify).not.toHaveBeenCalled()
  })
})
