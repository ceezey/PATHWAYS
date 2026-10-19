// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  actor,
  body,
  id,
  overview,
  projectId,
  renderer,
  service,
  state,
  tx,
  useReportsHarness,
} from './reports.service.harness'

import { describe, expect, it } from 'vitest'
import { sourceFingerprint } from './report-fingerprint'

describe('report source authority, privacy and artifact recovery', () => {
  useReportsHarness()
  it('rejects an invalid project UUID before querying artifact casts', async () => {
    await expect(service.export(actor, 'invalid', id)).rejects.toThrow('Report unavailable')
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('never transfers stale source bytes to the private reader', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id,
        projectId,
        formId: null,
        type: 'PROJECT_SUMMARY',
        sourceFingerprint: 'a'.repeat(64),
        status: 'GENERATED',
      },
    ])
    await expect(service.export(actor, projectId, id)).rejects.toThrow('Report source is stale')
    expect(state.read).not.toHaveBeenCalled()
  })
  it('refuses to export a report of a stored type that no route lists', async () => {
    tx.$queryRaw.mockResolvedValue([
      {
        id,
        projectId,
        formId: null,
        type: 'OTHER',
        sourceFingerprint: 'a'.repeat(64),
        status: 'GENERATED',
      },
    ])
    await expect(service.export(actor, projectId, id)).rejects.toThrow('Report unavailable')
    expect(state.read).not.toHaveBeenCalled()
  })
  it('returns sections with a flattened copy and sends them to the designed renderer', async () => {
    const preview = await service.preview(actor, projectId, { kind: 'PROJECT_SUMMARY' })
    expect(preview.sections?.information.code).toBe('SYN')
    expect(preview.columns).toEqual(['Section', 'Item', 'Value', 'Detail'])
    expect(preview.rows.some((row) => row[0] === 'Project information')).toBe(true)
    // This actor holds none of the overview grants, so those rows and their reasons are left out.
    expect(preview.rows.some((row) => row[0] === 'Overview')).toBe(false)
    expect(preview.unavailableReasons).toEqual([])
    renderer.render.mockResolvedValue(Buffer.from('%PDF-designed'))
    const acknowledgement = await service.generate(actor, projectId, body).catch(() => undefined)
    expect(acknowledgement).not.toHaveProperty('pdfFallback')
    expect(renderer.render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        sections: expect.objectContaining({ overview: expect.any(Array) }),
      }),
    )
  })
  describe('project summary section integrity', () => {
    const budgetOverview = (state: string) => ({
      businessDate: '2026-10-06',
      timeline: { metric: { state: 'AVAILABLE', value: '50', reason: null } },
      budgetUtilization: {
        metric: { state, value: state === 'AVAILABLE' ? '40' : null, reason: null },
        approvedBudget: '100.00',
        countableSpending: '40.00',
      },
      kpiAchievement: null,
      beneficiariesReached: null,
    })
    it('rejects generation when a section-only field changes between prepare and finalize', async () => {
      overview.readInTransaction
        .mockResolvedValueOnce(budgetOverview('AVAILABLE'))
        .mockResolvedValue(budgetOverview('SUPPRESSED'))
      await expect(service.generate(actor, projectId, body)).rejects.toThrow(
        'Report source changed',
      )
    })
    it('rejects export when the stored fingerprint was taken from different sections', async () => {
      overview.readInTransaction.mockResolvedValue(budgetOverview('AVAILABLE'))
      const first = await service.preview(actor, projectId, { kind: 'PROJECT_SUMMARY' })
      const stored = sourceFingerprint({ ...first, evaluationId: null })
      tx.$queryRaw.mockResolvedValue([
        {
          id,
          projectId,
          formId: null,
          type: 'PROJECT_SUMMARY',
          sourceFingerprint: stored,
          status: 'GENERATED',
        },
      ])
      await service.export(actor, projectId, id).catch((error: Error) => {
        expect(error.message).not.toContain('stale')
      })
      overview.readInTransaction.mockResolvedValue(budgetOverview('SUPPRESSED'))
      await expect(service.export(actor, projectId, id)).rejects.toThrow('Report source is stale')
    })
  })
})
