import { describe, expect, it } from 'vitest'
import {
  alertStatuses,
  applyEvaluation,
  applyHumanAction,
  canAutoResolveRecommendation,
  decisionOutcomes,
  initialEpisodeCursor,
  supersedeEpisode,
} from './alert-lifecycle'

describe('episode latch independent of human state', () => {
  it('creates once while persistent and creates again only after verified clearance', () => {
    let cursor = initialEpisodeCursor()
    const first = applyEvaluation({ cursor, sequence: '1', result: 'TRUE' })
    expect(first.effect).toBe('CREATE')
    cursor = first.cursor
    expect(applyEvaluation({ cursor, sequence: '2', result: 'TRUE' }).effect).toBe('UPDATE')
    const cleared = applyEvaluation({ cursor, sequence: '3', result: 'FALSE' })
    expect(cleared.effect).toBe('AUTO_RESOLVE')
    expect(cleared.cursor).toMatchObject({ status: 'AUTO_RESOLVED', latched: false, episode: 1 })
    expect(
      applyEvaluation({ cursor: cleared.cursor, sequence: '4', result: 'TRUE' }).cursor,
    ).toMatchObject({ status: 'NEW', latched: true, episode: 2 })
  })
  it.each(['DISMISSED', 'RESOLVED'] as const)(
    'keeps %s latched through persistence and unavailable gaps',
    (status) => {
      const cursor = {
        ...applyEvaluation({ cursor: initialEpisodeCursor(), sequence: '1', result: 'TRUE' })
          .cursor,
        status,
      }
      const unavailable = applyEvaluation({ cursor, sequence: '2', result: 'UNAVAILABLE' })
      expect(unavailable.cursor).toMatchObject({ status, latched: true })
      expect(
        applyEvaluation({ cursor: unavailable.cursor, sequence: '3', result: 'TRUE' }).effect,
      ).toBe('UPDATE')
      const cleared = applyEvaluation({ cursor, sequence: '4', result: 'FALSE' })
      expect(cleared.cursor).toMatchObject({ status, latched: false })
      expect(
        applyEvaluation({ cursor: cleared.cursor, sequence: '5', result: 'TRUE' }).effect,
      ).toBe('CREATE')
    },
  )
  it.each(['NEW', 'REVIEWED', 'ACTIONED'] as const)(
    'auto-resolves open %s only for verified false',
    (status) => {
      const cursor = {
        ...applyEvaluation({ cursor: initialEpisodeCursor(), sequence: '1', result: 'TRUE' })
          .cursor,
        status,
      }
      expect(applyEvaluation({ cursor, sequence: '2', result: 'UNAVAILABLE' }).cursor.status).toBe(
        status,
      )
      expect(applyEvaluation({ cursor, sequence: '2', result: 'FALSE' }).cursor.status).toBe(
        'AUTO_RESOLVED',
      )
    },
  )
  it('ignores duplicate/stale ordered evaluations including large exact sequences', () => {
    const cursor = applyEvaluation({
      cursor: initialEpisodeCursor(),
      sequence: '9007199254740993',
      result: 'TRUE',
    }).cursor
    for (const sequence of ['1', '9007199254740992', '9007199254740993'])
      expect(applyEvaluation({ cursor, sequence, result: 'FALSE' })).toEqual({
        cursor,
        effect: 'IGNORED',
      })
    expect(applyEvaluation({ cursor, sequence: '9007199254740994', result: 'FALSE' }).effect).toBe(
      'AUTO_RESOLVE',
    )
  })
  it('supersedes evidence without resolving or retriggering', () => {
    const cursor = supersedeEpisode(
      applyEvaluation({ cursor: initialEpisodeCursor(), sequence: '1', result: 'TRUE' }).cursor,
    )
    expect(cursor.status).toBe('NEW')
    expect(applyEvaluation({ cursor, sequence: '2', result: 'FALSE' }).effect).toBe('IGNORED')
  })
  it('rejects invalid cursors, ordering and unknown results', () => {
    expect(() =>
      applyEvaluation({
        cursor: { ...initialEpisodeCursor(), latched: true },
        sequence: '1',
        result: 'TRUE',
      }),
    ).toThrow()
    expect(() =>
      applyEvaluation({ cursor: initialEpisodeCursor(), sequence: '-1', result: 'TRUE' }),
    ).toThrow()
    expect(() =>
      applyEvaluation({ cursor: initialEpisodeCursor(), sequence: '1', result: 'SUPPRESSED' }),
    ).toThrow()
    for (const status of ['NEW', 'REVIEWED', 'ACTIONED'])
      expect(() =>
        applyEvaluation({
          cursor: { ...initialEpisodeCursor(), episode: 1, status },
          sequence: '1',
          result: 'TRUE',
        }),
      ).toThrow()
    expect(() =>
      applyEvaluation({
        cursor: { ...initialEpisodeCursor(), episode: 1, status: 'AUTO_RESOLVED', latched: true },
        sequence: '1',
        result: 'TRUE',
      }),
    ).toThrow()
  })
})

describe('human actions do not prove condition resolution', () => {
  for (const status of alertStatuses)
    for (const outcome of decisionOutcomes) {
      it(`${status} records ${outcome} independently`, () => {
        const result = applyHumanAction(status, {
          kind: 'OUTCOME',
          outcome,
          note: ' Synthetic outcome ',
        })
        const terminal = ['RESOLVED', 'DISMISSED', 'AUTO_RESOLVED'].includes(status)
        expect(result.status).toBe(
          !terminal && ['ACCEPT', 'PARTIALLY_ACCEPT'].includes(outcome) ? 'ACTIONED' : status,
        )
        expect(result.outcome).toBe(outcome)
        expect(result.note).toBe('Synthetic outcome')
      })
    }
  it.each(alertStatuses)('review preserves advanced state %s', (status) => {
    expect(applyHumanAction(status, { kind: 'REVIEW' }).status).toBe(
      status === 'NEW' ? 'REVIEWED' : status,
    )
  })
  it.each(['NEW', 'REVIEWED', 'ACTIONED'] as const)(
    'supports explicit dispositions for %s',
    (status) => {
      expect(applyHumanAction(status, { kind: 'RESOLVE', note: 'Verified manually' }).status).toBe(
        'RESOLVED',
      )
      expect(applyHumanAction(status, { kind: 'DISMISS', note: 'Not actionable' }).status).toBe(
        'DISMISSED',
      )
    },
  )
  it.each(['RESOLVED', 'DISMISSED', 'AUTO_RESOLVED'] as const)(
    'rejects another disposition of %s',
    (status) => {
      expect(() => applyHumanAction(status, { kind: 'RESOLVE', note: 'Again' })).toThrow()
      expect(() => applyHumanAction(status, { kind: 'DISMISS', note: 'Again' })).toThrow()
    },
  )
  it.each(['OUTCOME', 'RESOLVE', 'DISMISS'])('requires bounded notes for %s', (kind) => {
    const action = { kind, ...(kind === 'OUTCOME' ? { outcome: 'ACCEPT' } : {}) }
    for (const note of [undefined, '', '   ', 'a'.repeat(2001)])
      expect(() => applyHumanAction('NEW', { ...action, note })).toThrow()
  })
})

describe('recommendation auto-resolution eligibility', () => {
  it('allows only open recommendations with no recorded decision', () => {
    expect(canAutoResolveRecommendation('NEW', false)).toBe(true)
    expect(canAutoResolveRecommendation('REVIEWED', false)).toBe(true)
    expect(canAutoResolveRecommendation('REVIEWED', true)).toBe(false)
    for (const status of ['RESOLVED', 'DISMISSED', 'AUTO_RESOLVED'])
      expect(canAutoResolveRecommendation(status, false)).toBe(false)
  })
})
