import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getActivity: vi.fn(),
  getAssignableProjectOfficers: vi.fn(),
}))

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: client }))

import {
  useActivityDetailRead,
  useAssignableOfficersRead,
  useProjectActivitiesRead,
} from './activities.reads'

const signal = new AbortController().signal

describe('activity authorized reads', () => {
  beforeEach(() => {
    read.mockReset()
    client.getActivities.mockReset()
    client.getActivity.mockReset()
    client.getAssignableProjectOfficers.mockReset()
  })

  it('reads the project activity list under one shared key with summary freshness', () => {
    useProjectActivitiesRead('project-1')
    useProjectActivitiesRead('project-2', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['project-activities', 'project-1', 'activities.read'],
      ['project-activities', 'project-2', 'activities.read'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls[0][5]).toEqual({ freshness: 'summary' })
    read.mock.calls[0][3](signal)
    expect(client.getActivities).toHaveBeenCalledWith('project-1', signal)
  })

  it('reads one activity under its own key, always re-verified, and stays idle without an id', () => {
    useActivityDetailRead('project-1', 'activity-1')
    useActivityDetailRead('project-1', null)
    expect(read.mock.calls[0].slice(0, 3)).toEqual([
      'activity-detail:activity-1',
      'project-1',
      'activities.read',
    ])
    expect(read.mock.calls[0][4]).toBe(true)
    expect(read.mock.calls[0][5]).toBeUndefined()
    expect(read.mock.calls[1].slice(0, 3)).toEqual([
      'activity-detail:none',
      'project-1',
      'activities.read',
    ])
    expect(read.mock.calls[1][4]).toBe(false)
    read.mock.calls[0][3](signal)
    expect(client.getActivity).toHaveBeenCalledWith('project-1', 'activity-1', signal)
    read.mock.calls[1][3](signal)
    expect(client.getActivity).toHaveBeenLastCalledWith('project-1', '', signal)
  })

  it('reads the assignable officers under the create or update permission the caller holds', () => {
    useAssignableOfficersRead('project-1', 'activities.create', true)
    useAssignableOfficersRead('project-1', 'activities.update', false)
    expect(read.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['activity-assignable-officers', 'project-1', 'activities.create'],
      ['activity-assignable-officers', 'project-1', 'activities.update'],
    ])
    expect(read.mock.calls.map((call) => call[4])).toEqual([true, false])
    expect(read.mock.calls.map((call) => call[5])).toEqual([
      { freshness: 'summary' },
      { freshness: 'summary' },
    ])
    read.mock.calls[0][3](signal)
    expect(client.getAssignableProjectOfficers).toHaveBeenCalledWith('project-1', signal)
  })
})
