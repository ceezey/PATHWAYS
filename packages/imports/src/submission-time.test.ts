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
    expect(proposedEnrollmentDate('2026-01-14T16:30:00Z', 'SubmissionDate', 'DMY')).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-14T15:59:59Z', 'SubmissionDate', 'DMY')).toBe(
      '2026-01-14',
    )
    expect(proposedEnrollmentDate('2026-01-14T16:30:00Z', 'SubmissionDate', null)).toBe(
      '2026-01-15',
    )
  })

  it('reads a value with no zone as UTC and a value with a zone from that zone', () => {
    expect(proposedEnrollmentDate('2026-01-14T18:30:00', '_submission_time', 'DMY')).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-15T00:30:00+08:00', 'SubmissionDate', 'DMY')).toBe(
      '2026-01-15',
    )
    expect(proposedEnrollmentDate('2026-01-14T20:00:00-05:00', 'SubmissionDate', 'DMY')).toBe(
      '2026-01-15',
    )
  })

  it('proposes a date-only value as written under any header', () => {
    expect(proposedEnrollmentDate('2026-01-14', '_submission_time', 'DMY')).toBe('2026-01-14')
    expect(proposedEnrollmentDate('2026-01-14', 'Timestamp', null)).toBe('2026-01-14')
    expect(proposedEnrollmentDate('2026-02-30', 'Timestamp', null)).toBeNull()
  })

  it('reads Google Forms text as local time with the date order', () => {
    expect(proposedEnrollmentDate('1/15/2026 10:21:44', 'Timestamp', 'MDY')).toBe('2026-01-15')
    expect(proposedEnrollmentDate('15/01/2026 10:21:44', 'Timestamp', 'DMY')).toBe('2026-01-15')
    expect(proposedEnrollmentDate('1/15/2026 10:21:44', 'Timestamp', null)).toBeNull()
  })

  it('reads a spreadsheet serial as the date written', () => {
    expect(proposedEnrollmentDate(46037.43, 'Timestamp', null)).toBe('2026-01-15')
  })

  it('gives no proposal for a blank or unreadable value', () => {
    expect(proposedEnrollmentDate('', 'Timestamp', 'DMY')).toBeNull()
    expect(proposedEnrollmentDate(null, 'Timestamp', 'DMY')).toBeNull()
    expect(proposedEnrollmentDate('not a date', 'Timestamp', 'DMY')).toBeNull()
  })
})
