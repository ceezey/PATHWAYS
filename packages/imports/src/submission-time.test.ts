import { describe, expect, it } from 'vitest'

import {
  SUBMISSION_TIME_HEADERS,
  proposedEnrollmentDate,
  submissionTimeColumn,
} from './submission-time'

describe('submissionTimeColumn', () => {
  it('finds the first submission time header ignoring case, in the list order', () => {
    expect(
      submissionTimeColumn([
        { key: 'column_0001', header: 'Name' },
        { key: 'column_0002', header: 'timestamp' },
      ]),
    ).toEqual({ key: 'column_0002', header: 'timestamp' })
    expect(
      submissionTimeColumn([
        { key: 'column_0001', header: 'Timestamp' },
        { key: 'column_0002', header: '_SUBMISSION_TIME' },
      ]),
    ).toEqual({ key: 'column_0002', header: '_SUBMISSION_TIME' })
    expect(SUBMISSION_TIME_HEADERS).toEqual(['_submission_time', 'SubmissionDate', 'Timestamp'])
  })

  it('is null when no header matches', () => {
    expect(submissionTimeColumn([{ key: 'column_0001', header: 'Name' }])).toBeNull()
  })
})

describe('proposedEnrollmentDate', () => {
  it('moves a UTC value to the Manila date at the midnight boundary', () => {
    expect(proposedEnrollmentDate('2026-01-14T16:30:00Z', 'SubmissionDate', 'DMY', 2026)).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-14T15:59:59Z', 'SubmissionDate', 'DMY', 2026)).toBe(
      '2026-01-14',
    )
    expect(proposedEnrollmentDate('2026-01-14T16:30:00Z', 'SubmissionDate', null, 2026)).toBe(
      '2026-01-15',
    )
  })

  it('reads a value with no zone as UTC and a value with a zone from that zone', () => {
    expect(proposedEnrollmentDate('2026-01-14T18:30:00', '_submission_time', 'DMY', 2026)).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-15T00:30:00+08:00', 'SubmissionDate', 'DMY', 2026)).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-14T20:00:00-05:00', 'SubmissionDate', 'DMY', 2026)).toBe(
      '2026-01-15',
    )
  })

  it('keeps a Google Forms Timestamp with no zone as local time but converts one with a zone', () => {
    expect(proposedEnrollmentDate('2026-01-15 23:30:00', 'Timestamp', null, 2026)).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-15 23:30:00', ' timestamp ', null, 2026)).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-15 23:30:00', '_submission_time', null, 2026)).toBe(
      '2026-01-16',
    )
    expect(proposedEnrollmentDate('2026-01-14T16:30:00Z', 'Timestamp', null, 2026)).toBe(
      '2026-01-15',
    )
  })

  it('proposes a date-only value as written under any header', () => {
    expect(proposedEnrollmentDate('2026-01-14', '_submission_time', 'DMY', 2026)).toBe('2026-01-14')
    expect(proposedEnrollmentDate('2026-01-14', 'Timestamp', null, 2026)).toBe('2026-01-14')
    expect(proposedEnrollmentDate('2026-02-30', 'Timestamp', null, 2026)).toBeNull()
  })

  it('reads Google Forms text as local time with the date order', () => {
    expect(proposedEnrollmentDate('1/15/2026 10:21:44', 'Timestamp', 'MDY', 2026)).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('15/01/2026 10:21:44', 'Timestamp', 'DMY', 2026)).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('1/15/2026 10:21:44', 'Timestamp', null, 2026)).toBeNull()
  })

  it('reads a spreadsheet serial as the date written', () => {
    expect(proposedEnrollmentDate(46037.43, 'Timestamp', null, 2026)).toBe('2026-01-15')
  })

  it('reads a two-digit year against the given reference year, not the clock', () => {
    expect(proposedEnrollmentDate('15/01/27 10:21:44', 'Timestamp', 'DMY', 2027)).toBe('2027-01-15')
    expect(proposedEnrollmentDate('15/01/27 10:21:44', 'Timestamp', 'DMY', 2026)).toBe('1927-01-15')
  })

  it('gives no proposal for a date part that is not a real calendar date', () => {
    expect(proposedEnrollmentDate('2026-02-30T10:00:00Z', 'SubmissionDate', null, 2026)).toBeNull()
    expect(proposedEnrollmentDate('2026-02-30 10:00:00', 'Timestamp', null, 2026)).toBeNull()
    expect(proposedEnrollmentDate('2026-02-30 10:00:00', '_submission_time', null, 2026)).toBeNull()
  })

  it('gives no proposal for a blank or unreadable value', () => {
    expect(proposedEnrollmentDate('', 'Timestamp', 'DMY', 2026)).toBeNull()
    expect(proposedEnrollmentDate(null, 'Timestamp', 'DMY', 2026)).toBeNull()
    expect(proposedEnrollmentDate('not a date', 'Timestamp', 'DMY', 2026)).toBeNull()
  })
})
