import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { RulesHumanService } from '../rules/rules-human.service'
import type { PrivateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import type { ReportPdfRenderer } from './report-pdf.renderer'
import { ReportsService } from './reports.service'

const state = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (_db: unknown, _identity: unknown, permission: string) => {
    state.permissions.push(permission)
    throw new Error('accepted')
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const formId = '20000000-0000-4000-8000-000000000002'
const evaluationId = '30000000-0000-4000-8000-000000000003'
const actor = { roles: ['PROJECT_MANAGER'], permissions: [] } as unknown as ApplicationIdentity
const service = new ReportsService(
  {} as PrismaService,
  {} as StorageService,
  {} as DashboardsService,
  {} as ReportPdfRenderer,
  {} as ProjectOverviewMetricsService,
  {} as RulesHumanService,
  {} as PrivateStorageFactories,
)
const request = {
  clientRequestId: '40000000-0000-4000-8000-000000000004',
  name: 'Quarterly summary',
  kind: 'PROJECT_SUMMARY',
  format: 'CSV',
}

// Returns the 400 message of a service call, or 'accepted' when it reached the authorized operation.
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    await call()
    return 'returned'
  } catch (error) {
    if (error instanceof BadRequestException) return error.message
    return (error as Error).message
  }
}

describe('report request validation', () => {
  beforeEach(() => {
    state.permissions = []
  })

  it.each([
    [{ kind: 'PROJECT_SUMMARY' }, 'accepted'],
    [{ kind: 'SURVEY_FORM_RESULTS', formId }, 'accepted'],
    [{ kind: 'EVALUATION_REPORT', evaluationId }, 'accepted'],
    [{ kind: 'SURVEY_FORM_RESULTS' }, 'Invalid report context.'],
    [{ kind: 'PROJECT_SUMMARY', formId }, 'Invalid report context.'],
    [{ kind: 'PROJECT_SUMMARY', evaluationId }, 'Invalid report context.'],
    [{ kind: 'UNKNOWN' }, 'Invalid report context.'],
    [{ kind: 'PROJECT_SUMMARY', format: 'CSV' }, 'Invalid report context.'],
  ])('previews %j as %s', async (query, expected) => {
    expect(await outcome(() => service.preview(actor, projectId, query))).toBe(expected)
  })

  it.each([
    [request, 'accepted'],
    [{ ...request, name: ' Padded name ' }, 'accepted'],
    [{ ...request, kind: 'SURVEY_FORM_RESULTS', formId }, 'accepted'],
    [{ ...request, format: 'DOCX' }, 'Invalid report request.'],
    [{ ...request, name: '   ' }, 'Invalid report request.'],
    [{ ...request, clientRequestId: 'x' }, 'Invalid report request.'],
    [{ ...request, evaluationId }, 'Invalid report request.'],
    [{ ...request, extra: true }, 'Invalid report request.'],
  ])('generates %j as %s', async (body, expected) => {
    expect(await outcome(() => service.generate(actor, projectId, body))).toBe(expected)
  })

  it('refuses a malformed project id before reading the body', async () => {
    expect(await outcome(() => service.generate(actor, 'not-a-uuid', {}))).toBe(
      'Project unavailable.',
    )
    expect(state.permissions).toEqual([])
  })
})
