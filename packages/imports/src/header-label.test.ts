import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { importHeaderLabel } from './header-label'
import { IMPORT_ENGINEERING_LIMITS } from './limits'
import { parseSecureImport } from './parser/secure'

const LONG_QUESTION =
  'Using your usual (customary) language, do you have difficulty communicating, for example understanding or being understood?'

describe('import header labels', () => {
  it('keeps short headers and strips the BOM and outer spaces', () => {
    expect(importHeaderLabel('﻿ Participant ID  ')).toBe('Participant ID')
  })

  it('shortens a long question header to the stored limit with an ellipsis', () => {
    const label = importHeaderLabel(LONG_QUESTION)
    expect(label.length).toBeLessThanOrEqual(IMPORT_ENGINEERING_LIMITS.maxHeaderCharacters)
    expect(Array.from(label).length).toBeLessThanOrEqual(100)
    expect(label.endsWith('…')).toBe(true)
    expect(LONG_QUESTION.startsWith(label.slice(0, -1))).toBe(true)
  })

  it('never splits a surrogate pair when shortening', () => {
    const label = importHeaderLabel(`${'a'.repeat(98)}\u{1F600}tail`)
    expect(label).toBe(`${'a'.repeat(98)}…`)
  })

  it('parses a CSV whose question header is longer than the stored limit', async () => {
    const csv = `Participant ID,"${LONG_QUESTION}",Track  \nNS-1,A. Hindi,A. Employment\n`
    const parsed = await parseSecureImport(Buffer.from(csv, 'utf8'), 'CSV')
    expect(parsed.sourceColumns.map((column) => column.header)).toEqual([
      'Participant ID',
      importHeaderLabel(LONG_QUESTION),
      'Track',
    ])
    expect(parsed.rows[0]?.values.column_0002).toBe('A. Hindi')
  })

  it('still rejects an empty header', async () => {
    await expect(
      parseSecureImport(Buffer.from('Name, \nA,B\n', 'utf8'), 'CSV'),
    ).rejects.toMatchObject({
      code: 'HEADER_INVALID',
    })
  })
})
