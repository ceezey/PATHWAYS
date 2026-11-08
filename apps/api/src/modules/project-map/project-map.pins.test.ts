import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import type { PrismaService } from '@app/prisma/prisma.service'

import { applySavedPins, resolvePlaces } from '../../common/places/ph-places'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'

const state = vi.hoisted(() => ({ tx: undefined as Prisma.TransactionClient | undefined }))

vi.mock('@app/common/authz/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, { organizationId: '11000000-0000-4000-8000-000000000001', roles: [] }),
  ),
}))
vi.mock('@app/common/authz/project-scope', () => ({ projectScope: () => ({}) }))

import { ProjectMapService } from './project-map.service'

const places = resolvePlaces('Borongan and Guiuan, Eastern Samar')
const [borongan, guiuan] = places
if (!borongan || !guiuan) throw new Error('Fixture places must resolve')

describe('applySavedPins', () => {
  it('moves the matching place and keeps the rest at the centroid', () => {
    const result = applySavedPins(places, [
      { name: 'Borongan', province: 'Eastern Samar', longitude: 125.5, latitude: 11.6 },
    ])
    expect(result).toEqual([
      { ...borongan, longitude: 125.5, latitude: 11.6, saved: true, locked: false },
      { ...guiuan, saved: false, locked: false },
    ])
  })

  it('carries the locked flag of a saved pin', () => {
    const [first] = applySavedPins(places, [
      { ...borongan, longitude: 125.5, latitude: 11.6, locked: true },
    ])
    expect(first).toMatchObject({ saved: true, locked: true })
  })

  it('reads a locked pin at the centroid as unmoved', () => {
    const [first] = applySavedPins(places, [
      {
        name: 'Borongan',
        province: 'Eastern Samar',
        longitude: borongan.longitude,
        latitude: borongan.latitude,
        locked: true,
      },
    ])
    expect(first).toEqual({ ...borongan, saved: false, locked: true })
  })

  it('ignores a pin for a place the area no longer lists', () => {
    const result = applySavedPins(places, [
      {
        name: 'Catarman',
        province: 'Northern Samar',
        longitude: 124.7,
        latitude: 12.6,
        locked: true,
      },
    ])
    expect(result).toHaveLength(2)
    expect(result.every((place) => !place.saved && !place.locked)).toBe(true)
  })

  it('matches on province as well as name', () => {
    const [first] = applySavedPins(places, [
      { name: 'Borongan', province: 'Cebu', longitude: 125.5, latitude: 11.6 },
    ])
    expect(first).toMatchObject({ saved: false, longitude: borongan.longitude })
  })
})

const projectId = '22000000-0000-4000-8000-000000000002'
const tx = {
  project: { findMany: vi.fn() },
  projectMapPin: { findMany: vi.fn() },
}
const overview = { read: vi.fn() }
const service = new ProjectMapService(
  {} as PrismaService,
  overview as unknown as ProjectOverviewMetricsService,
  {} as DashboardsService,
)
const project = (implementationArea: string | null) => ({
  id: projectId,
  code: 'P-1',
  title: 'Project',
  status: 'ACTIVE',
  implementationArea,
})
const read = () => service.read({} as ApplicationIdentity)

describe('ProjectMapService.read pins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tx = tx as unknown as Prisma.TransactionClient
    overview.read.mockResolvedValue(null)
    tx.projectMapPin.findMany.mockResolvedValue([])
  })

  it('draws a saved pin at its saved position and maps placeName to name', async () => {
    tx.project.findMany.mockResolvedValue([project('Borongan, Eastern Samar')])
    tx.projectMapPin.findMany.mockResolvedValue([
      {
        projectId,
        placeName: 'Borongan',
        province: 'Eastern Samar',
        longitude: 125.5,
        latitude: 11.6,
        locked: true,
      },
    ])
    const map = await read()
    expect(map.projects[0]?.places).toMatchObject([
      { name: 'Borongan', longitude: 125.5, latitude: 11.6, saved: true, locked: true },
    ])
    expect(tx.projectMapPin.findMany).toHaveBeenCalledTimes(1)
    expect(tx.projectMapPin.findMany.mock.calls[0]?.[0].where).toMatchObject({
      projectId: { in: [projectId] },
    })
  })

  it('hides a locked pin of a place the area dropped', async () => {
    tx.project.findMany.mockResolvedValue([project('Borongan, Eastern Samar')])
    tx.projectMapPin.findMany.mockResolvedValue([
      {
        projectId,
        placeName: 'Guiuan',
        province: 'Eastern Samar',
        longitude: 125.7,
        latitude: 11.0,
        locked: true,
      },
    ])
    const map = await read()
    expect(map.projects[0]?.places).toHaveLength(1)
    expect(map.projects[0]?.places[0]).toMatchObject({ name: 'Borongan', saved: false })
  })

  it('skips the pin query when no project is located', async () => {
    tx.project.findMany.mockResolvedValue([project('Nowhere at all')])
    const map = await read()
    expect(map.projects).toEqual([])
    expect(tx.projectMapPin.findMany).not.toHaveBeenCalled()
  })
})
