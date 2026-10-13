import 'reflect-metadata'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '@app/common/authz/application-identity'
import type { PrismaService } from '@app/prisma/prisma.service'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndicatorLibraryController } from './indicator-library.controller'
import { IndicatorLibraryService } from './indicator-library.service'
import { IndicatorMeasurementsService } from './indicator-measurements.service'
import { IndicatorValuesController } from './indicator-values.controller'
import { IndicatorsController } from './indicators.controller'
import { IndicatorsService } from './indicators.service'

const boundary = vi.hoisted(() => ({ run: vi.fn() }))
const steps = vi.hoisted(() => ({
  begin: vi.fn(),
  read: vi.fn(),
  bootstrap: vi.fn(),
  scoped: vi.fn(),
}))
vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: boundary.run }))
vi.mock('@app/common/authz/scoped-project', () => ({ requireScopedProject: steps.scoped }))
vi.mock('@app/modules/rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  beginRuleSourceOperation: steps.begin,
  readRuleSourceAcknowledgement: steps.read,
  bootstrapRuleSourceProject: steps.bootstrap,
}))

const projectId = '79100000-0000-4000-8000-000000000001'
const indicatorId = '79100000-0000-4000-8000-000000000002'
const requestKey = '79100000-0000-4000-8000-000000000003'
const actor: ApplicationIdentity = {
  id: '79100000-0000-4000-8000-000000000004',
  aal: 'aal2',
  organizationId: '79100000-0000-4000-8000-000000000005',
  userId: '79100000-0000-4000-8000-000000000006',
  fullName: 'Synthetic M&E',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['indicators.create', 'indicators.update', 'indicators.archive'],
  assignedProjectIds: [projectId],
}
const definition = {
  clientMutationId: requestKey,
  code: 'SYNTHETIC_COUNT',
  name: 'Synthetic count',
  unitLabel: 'people',
  dataSource: 'Synthetic register',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  baseline: '0',
  target: '10',
}
const indicators = new IndicatorsService({} as PrismaService)
const library = new IndicatorLibraryService({} as PrismaService, indicators)
const measurements = new IndicatorMeasurementsService({} as PrismaService, indicators)
const controller = new IndicatorsController(indicators, library, measurements)
const signedIn: AuthenticatedRequest = { headers: {}, user: actor }
const anonymous: AuthenticatedRequest = { headers: {} }
const issue = (field: string, message: string) => ({ field, message })

// The 400 body a rejected indicator request answers, or a failure when nothing threw it.
async function invalid(run: () => unknown) {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as BadRequestException).getStatus()).toBe(400)
    return (error as BadRequestException).getResponse()
  }
  throw new Error('Expected a BadRequestException.')
}

beforeEach(() => {
  boundary.run.mockReset()
  for (const step of Object.values(steps)) step.mockReset()
})

describe('indicator request validation', () => {
  it('answers the indicator 400 body with at most five issues for an empty definition', async () => {
    expect(await invalid(() => indicators.create(actor, projectId, {}))).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('code', 'Required'),
        issue('name', 'Required'),
        issue('unitLabel', 'Required'),
        issue('dataSource', 'Required'),
        issue('mode', 'Required'),
      ],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('names a forged key and a definition rule at the root path', async () => {
    expect(
      await invalid(() => indicators.create(actor, projectId, { ...definition, role: 'X' })),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('', "Unrecognized key(s) in object: 'role'")],
    })
    expect(
      await invalid(() => indicators.create(actor, projectId, { ...definition, mode: 'DERIVED' })),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('', 'Exactly derived indicators require a binding.')],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('rejects label, measurement and archive bodies before any authorized operation', async () => {
    expect(
      await invalid(() =>
        indicators.update(actor, projectId, indicatorId, {
          clientMutationId: requestKey,
          name: '',
          expectedRevision: 0,
        }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('name', 'String must contain at least 1 character(s)'),
        issue('expectedRevision', 'Number must be greater than or equal to 1'),
      ],
    })
    expect(
      await invalid(() =>
        measurements.measure(actor, projectId, indicatorId, {
          clientMeasurementId: requestKey,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          value: 'abc',
          source: 'Synthetic register',
        }),
      ),
    ).toEqual({ message: 'Invalid indicator request.', issues: [issue('value', 'Invalid')] })
    expect(
      await invalid(() =>
        controller.archive(signedIn, projectId, indicatorId, { expectedRevision: 1 }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('clientMutationId', 'Required')],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('rejects library entry and from-library bodies before any authorized operation', async () => {
    expect(await invalid(() => library.create(actor, { code: 'lowercase' }))).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('code', 'Invalid'),
        issue('name', 'Required'),
        issue('unitLabel', 'Required'),
        issue('dataSource', 'Required'),
        issue('mode', 'Required'),
      ],
    })
    expect(
      await invalid(() =>
        library.createProjectIndicator(actor, projectId, { libraryEntryId: 'x' }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [
        issue('libraryEntryId', 'Invalid uuid'),
        issue('clientMutationId', 'Required'),
        issue('periodStart', 'Required'),
        issue('periodEnd', 'Required'),
        issue('baseline', 'Required'),
      ],
    })
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('validates the definition copied from a library entry with the project values', async () => {
    boundary.run.mockResolvedValueOnce([
      {
        code: 'FEWER_DROPOUTS',
        name: 'Fewer dropouts',
        description: null,
        unitLabel: 'learners',
        dataSource: 'Synthetic register',
        measurementMode: 'MANUAL',
        numericKind: 'COUNT',
        direction: 'LOWER_IS_BETTER',
        displayPrecision: 0,
        recipe: null,
      },
    ])
    expect(
      await invalid(() =>
        library.createProjectIndicator(actor, projectId, {
          libraryEntryId: indicatorId,
          clientMutationId: requestKey,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          baseline: '0',
          target: '10',
        }),
      ),
    ).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('', 'Target conflicts with the selected direction.')],
    })
    expect(boundary.run).toHaveBeenCalledTimes(1)
  })
})

describe('indicator request identity', () => {
  it('answers 403 on every indicator route reached without an application profile', () => {
    const calls = [
      () => controller.list(anonymous, projectId),
      () => controller.get(anonymous, projectId, indicatorId),
      () => controller.create(anonymous, projectId, definition),
      () => controller.createFromLibrary(anonymous, projectId, {}),
      () => controller.update(anonymous, projectId, indicatorId, {}),
      () => controller.measure(anonymous, projectId, indicatorId, {}),
      () => new IndicatorValuesController(indicators).list(anonymous, projectId),
      () => new IndicatorLibraryController(library).list(anonymous),
      () => new IndicatorLibraryController(library).create(anonymous, {}),
      () => new IndicatorLibraryController(library).archive(anonymous, indicatorId),
    ]
    for (const call of calls) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Application profile is required.')
    }
    expect(boundary.run).not.toHaveBeenCalled()
  })

  it('parses the archive body before it checks the application profile', async () => {
    expect(await invalid(() => controller.archive(anonymous, projectId, indicatorId, {}))).toEqual({
      message: 'Invalid indicator request.',
      issues: [issue('clientMutationId', 'Required'), issue('expectedRevision', 'Required')],
    })
    const valid = { clientMutationId: requestKey, expectedRevision: 1 }
    expect(() => controller.archive(anonymous, projectId, indicatorId, valid)).toThrow(
      ForbiddenException,
    )
    expect(boundary.run).not.toHaveBeenCalled()
  })
})

describe('indicator id path parameter', () => {
  it('answers 404 Indicator unavailable. for a non-UUID id on get, update, archive and measure', async () => {
    boundary.run.mockImplementation((_prisma, _identity, _operation, run) => run({}, actor))
    steps.begin.mockResolvedValue({ kind: 'NEW' })
    steps.read.mockResolvedValue(null)
    steps.scoped.mockResolvedValue(projectId)
    const id = 'not-a-uuid'
    const calls = [
      () => controller.get(signedIn, projectId, id),
      () =>
        controller.update(signedIn, projectId, id, {
          clientMutationId: requestKey,
          name: 'Renamed',
          expectedRevision: 1,
        }),
      () =>
        controller.archive(signedIn, projectId, id, {
          clientMutationId: requestKey,
          expectedRevision: 1,
        }),
      () =>
        controller.measure(signedIn, projectId, id, {
          clientMeasurementId: requestKey,
          periodStart: '2026-01-01',
          periodEnd: '2026-06-30',
          value: '5',
          source: 'Synthetic register',
        }),
    ]
    for (const call of calls) {
      const error = await call().catch((thrown: unknown) => thrown)
      expect(error).toBeInstanceOf(NotFoundException)
      expect((error as NotFoundException).message).toBe('Indicator unavailable.')
    }
  })
})
