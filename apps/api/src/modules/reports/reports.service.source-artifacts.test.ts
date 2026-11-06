// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  body,
  field,
  formId,
  id,
  projectId,
  renderer,
  service,
  sha,
  state,
  storage,
  survey,
  tx,
  useReportsHarness,
} from './reports.service.harness'

import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { generateReportRequest, reportPreviewQuery } from '@pathways/shared'
import { describe, expect, it, vi } from 'vitest'

describe('report source authority, privacy and artifact recovery', () => {
  useReportsHarness()
  it('requires exact survey-only form context and rejects caller filter dimensions', () => {
    expect(reportPreviewQuery.safeParse({ kind: 'SURVEY_FORM_RESULTS' }).success).toBe(false)
    expect(reportPreviewQuery.safeParse({ kind: 'PROJECT_SUMMARY', formId }).success).toBe(false)
    expect(
      reportPreviewQuery.safeParse({
        kind: 'SURVEY_FORM_RESULTS',
        formId,
        periodStart: '2026-01-01',
      }).success,
    ).toBe(false)
    expect(
      generateReportRequest.safeParse({ ...body, kind: 'SURVEY_FORM_RESULTS', formId }).success,
    ).toBe(true)
  })
  it('does not trust a caller grant revoked in the current profile', async () => {
    state.actor = { ...actor, permissions: [] }
    await expect(service.preview(actor, projectId, { kind: 'PROJECT_SUMMARY' })).rejects.toThrow(
      ForbiddenException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })
  it('omits beneficiary report metadata when either aggregate grant is revoked', async () => {
    for (const missing of ['analytics.saddd.read', 'beneficiaries.aggregates.read']) {
      state.actor = {
        ...actor,
        permissions: [
          ...actor.permissions,
          'reports.beneficiary.read',
          'analytics.saddd.read',
          'beneficiaries.aggregates.read',
        ].filter((permission) => permission !== missing),
      }
      tx.report.findMany.mockResolvedValue([])
      await service.list(actor, projectId)
      const query = tx.report.findMany.mock.lastCall?.[0]
      expect(query?.where.type.in).not.toContain('BENEFICIARY_SUMMARY')
    }
  })
  it.each(['99999999999999.1234', '-99999999999999.1234'])(
    'preserves exact decimal mean text %s and fingerprint bytes',
    async (mean) => {
      tx.$queryRaw.mockResolvedValue([{ value: survey({ fields: [{ ...field, mean }] }) }])
      const preview = await service.preview(actor, projectId, {
        kind: 'SURVEY_FORM_RESULTS',
        formId,
      })
      expect(preview.rows[0][7]).toBe(mean)
      expect(sha({ rows: preview.rows })).not.toBe(
        sha({
          rows: preview.rows.map((row) =>
            row.map((cell) => (cell === mean ? String(Number(mean)) : cell)),
          ),
        }),
      )
      const query = tx.$queryRaw.mock.calls[0][0]
      expect(query.join('')).toContain("field->>'mean'")
    },
  )
  it('keeps every count and mean unavailable in a suppressed release', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        value: survey({
          state: 'SUPPRESSED',
          respondents: null,
          fields: [
            { ...field, answered: null, missing: null, mean: null, meanState: 'SUPPRESSED' },
          ],
        }),
      },
    ])
    const preview = await service.preview(actor, projectId, { kind: 'SURVEY_FORM_RESULTS', formId })
    expect(preview.rows[0].slice(2, 8)).toEqual(Array(6).fill('Not available'))
    expect(preview.rows[0][8]).toBe('SUPPRESSED')
  })
  it('lists a legacy indicator without measurement mode or direction in the indicator summary', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        value: [
          {
            id: '79000000-0000-4000-8000-000000000031',
            name: 'Legacy indicator',
            code: 'LEGACY-01',
            unitLabel: null,
            baseline: null,
            target: null,
            direction: null,
            periodStart: null,
            periodEnd: null,
            current: { state: 'MISSING', value: null, reason: 'LEGACY_REVIEW_REQUIRED' },
          },
        ],
      },
    ])
    const reader = { ...actor, permissions: [...actor.permissions, 'reports.indicator.read'] }
    state.actor = reader
    const preview = await service.preview(reader, projectId, { kind: 'INDICATOR_SUMMARY' })
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0].slice(0, 2)).toEqual(['LEGACY-01', 'Legacy indicator'])
  })
  it('rejects a malformed suppressed release rather than leaking a count', async () => {
    tx.$queryRaw.mockResolvedValue([{ value: survey({ state: 'SUPPRESSED', respondents: null }) }])
    await expect(
      service.preview(actor, projectId, { kind: 'SURVEY_FORM_RESULTS', formId }),
    ).rejects.toThrow('Invalid survey release shape')
  })
  it.each(['STALE', 'MISSING'])(
    'previews %s truthfully and rejects its generation before reservation',
    async (stateName) => {
      tx.$queryRaw.mockResolvedValue([
        { value: { state: stateName, respondents: null, fields: [] } },
      ])
      expect(
        (await service.preview(actor, projectId, { kind: 'SURVEY_FORM_RESULTS', formId })).rows,
      ).toEqual([])
      state.operations = 0
      await expect(
        service.generate(actor, projectId, { ...body, kind: 'SURVEY_FORM_RESULTS', formId }),
      ).rejects.toThrow('Survey aggregate unavailable')
      expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
    },
  )
  it('recovers the same generated report across UUID case aliases without another upload', async () => {
    let persisted: Record<string, unknown> | undefined
    tx.$executeRaw.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      if (sql.join('').includes('INSERT INTO pathways.reports')) {
        persisted = {
          id: values[0],
          projectId: values[2],
          hash: values[8],
          sourceFingerprint: values[9],
          status: 'DRAFT',
        }
      } else if (sql.join('').includes('UPDATE pathways.reports')) {
        if (!persisted) throw Error('Reservation missing')
        persisted.status = 'GENERATED'
      }
      return 1
    })
    tx.$queryRaw.mockImplementation(
      async (sql: { strings?: string[]; join?: (separator: string) => string }) => {
        const text = sql.strings?.join('') ?? sql.join?.('') ?? ''
        return text.includes('FROM pathways.reports') && persisted ? [persisted] : []
      },
    )
    const first = await service.generate(actor, projectId.toUpperCase(), {
      ...body,
      clientRequestId: id.toUpperCase(),
    })
    const lock = tx.$queryRaw.mock.calls.find((call) =>
      call[0].join('').includes('pg_advisory_xact_lock'),
    )
    expect(lock?.[0].join('')).toMatch(
      /^SELECT 1::integer AS locked FROM pg_catalog\.pg_advisory_xact_lock/,
    )
    const retry = await service.generate(actor, projectId, body)
    // pdfFallback describes the render that just ran, so a recovered report omits it.
    expect(retry).toEqual({ id: first.id, status: first.status })
    expect(storage.uploadPrivateFile).toHaveBeenCalledOnce()
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
    await expect(
      service.generate(actor, projectId, { ...body, name: 'Changed content' }),
    ).rejects.toThrow('Request key used for different report content')
  })
  it('preserves an uploaded artifact when finalize committed but its response was lost', async () => {
    state.lostCommit = true
    await expect(service.generate(actor, projectId, body)).rejects.toThrow('Commit response lost')
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
    expect(storage.uploadPrivateFile).toHaveBeenCalledOnce()
    expect(storage.deleteFile).not.toHaveBeenCalled()
  })
  it('deletes only its allocated upload when verification definitely fails before finalization', async () => {
    state.read.mockRejectedValue(Error('Hash mismatch'))
    const failure = service.generate(actor, projectId, body)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private report storage unavailable')
    expect(storage.deleteFile).toHaveBeenCalledOnce()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('reports a storage upload outage as unavailable without cleanup or audit', async () => {
    storage.uploadPrivateFile.mockRejectedValue(Error('provider detail'))
    const failure = service.generate(actor, projectId, body)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private report storage unavailable')
    expect(storage.deleteFile).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('returns a correctable artifact input problem as 422 before any upload', async () => {
    const { ReportArtifactInputError } = await import('./report-artifact.js')
    state.artifact.mockRejectedValue(
      new ReportArtifactInputError('PDF contains a character unsupported by the bundled font.'),
    )
    const failure = service.generate(actor, projectId, { ...body, name: 'Report 🌍' })
    await expect(failure).rejects.toBeInstanceOf(UnprocessableEntityException)
    await expect(failure).rejects.toThrow('unsupported by the bundled font')
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })
  it('maps a renderer or integrity fault to unavailable before any upload', async () => {
    state.artifact.mockRejectedValue(Error('Report font integrity unavailable.'))
    const failure = service.generate(actor, projectId, body)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Report generation temporarily unavailable')
    expect(storage.uploadPrivateFile).not.toHaveBeenCalled()
  })
  it('stores the designed PDF from the renderer without calling pdfkit', async () => {
    renderer.render.mockResolvedValue(Buffer.from('%PDF-designed'))
    const acknowledgement = await service.generate(actor, projectId, body).catch(() => undefined)
    expect(acknowledgement).not.toHaveProperty('pdfFallback')
    expect(renderer.render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: 'Private report', kind: 'PROJECT_SUMMARY' }),
    )
    expect(state.artifact).not.toHaveBeenCalled()
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      'pathways-private',
      expect.any(String),
      Buffer.from('%PDF-designed'),
      'application/pdf',
    )
  })
  it('falls back to the pdfkit artifact when the renderer fails', async () => {
    const acknowledgement = await service.generate(actor, projectId, body).catch(() => undefined)
    // The caller is told the stored PDF is the plain layout, so it can say it will not match.
    expect(acknowledgement).toMatchObject({ pdfFallback: true })
    expect(renderer.render).toHaveBeenCalledOnce()
    expect(state.artifact).toHaveBeenCalledOnce()
    const warning = vi.mocked(Logger.prototype.warn).mock.calls.flat().join(' ')
    expect(vi.mocked(Logger.prototype.warn)).toHaveBeenCalledOnce()
    expect(warning).toContain('at launch')
    expect(warning).toContain('using pdfkit')
    expect(warning).not.toContain('Private report')
    expect(storage.uploadPrivateFile).toHaveBeenCalledWith(
      'pathways-private',
      expect.any(String),
      Buffer.from('%PDF-fixture'),
      'application/pdf',
    )
  })
  it('never launches the renderer for spreadsheet formats', async () => {
    for (const format of ['CSV', 'XLS', 'XLSX'])
      await service
        .generate(actor, projectId, { ...body, format, clientRequestId: crypto.randomUUID() })
        .catch(() => undefined)
    expect(renderer.render).not.toHaveBeenCalled()
  })
  it('reports a private artifact read outage on export as unavailable without audit', async () => {
    let fingerprint: unknown
    tx.$executeRaw.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      if (sql.join('').includes('INSERT INTO pathways.reports')) fingerprint = values[9]
      return 1
    })
    await service.generate(actor, projectId, body)
    tx.auditLog.create.mockClear()
    tx.$queryRaw.mockImplementation(
      async (sql: { strings?: string[]; join?: (separator: string) => string }) => {
        const text = sql.strings?.join('') ?? sql.join?.('') ?? ''
        return text.includes('FROM pathways.reports')
          ? [
              {
                id,
                projectId,
                formId: null,
                type: 'PROJECT_SUMMARY',
                format: 'PDF',
                status: 'GENERATED',
                sourceFingerprint: fingerprint,
                bucket: 'pathways-private',
                key: 'organizations/synthetic/report.pdf',
                sha: 'b'.repeat(64),
                bytes: 12,
              },
            ]
          : []
      },
    )
    state.read.mockRejectedValue(Error('network detail'))
    const failure = service.export(actor, projectId, id)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private report artifact unavailable')
    expect(state.read).toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
