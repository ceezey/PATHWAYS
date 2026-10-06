import { Readable } from 'node:stream'
import { BadRequestException, type StreamableFile } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { ActivitiesController } from './activities.controller'
import type { ActivitiesService } from './activities.service'
import type { PrivateProofInspectionService } from './private-proof-inspection.service'

const id = '10000000-0000-4000-8000-000000000001'
const iso = '2026-09-27T00:00:00.000Z'
const query = {
  expectedActivityUpdatedAt: iso,
  expectedUpdateUpdatedAt: iso,
  expectedEvidenceUpdatedAt: iso,
}
const build = (released: object) => {
  const inspect = vi.fn(async () => released)
  const controller = new ActivitiesController(
    {} as ActivitiesService,
    {
      inspect,
    } as unknown as PrivateProofInspectionService,
  )
  const headers: Record<string, string> = {}
  const call = (range?: string) =>
    controller.inspectProof(
      { user: {}, headers: { range } } as unknown as AuthenticatedRequest,
      id,
      id,
      id,
      id,
      query,
      {
        setHeader: (name, value) => {
          headers[name] = value
        },
      },
    )
  return { call, headers, inspect }
}

describe('inspection route response', () => {
  it('sets safe headers and the released type and extension', async () => {
    const { call, headers } = build({
      body: Readable.from([Buffer.from('%PDF-')]),
      byteSize: 5,
      contentType: 'application/pdf',
      fileName: 'activity-proof.pdf',
    })
    const file = (await call()) as StreamableFile
    expect(headers['Cache-Control']).toBe('private, no-store')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'attachment; filename="activity-proof.pdf"',
      length: 5,
    })
  })
  it('rejects a range request before inspecting', async () => {
    const { call, inspect } = build({})
    await expect(call('bytes=0-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(inspect).not.toHaveBeenCalled()
  })
})
