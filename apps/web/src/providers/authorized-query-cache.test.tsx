/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUTHORIZATION_DENIED_EVENT,
  WRITE_COMMITTED_EVENT,
} from '@/lib/services/authorized-read-events'
import {
  AuthorizedQueryProvider,
  SUMMARY_READ_STALE_MS,
  authorizedReadPolicy,
  useAuthorizedRead,
} from './authorized-query-provider'

const state = vi.hoisted(() => ({
  profile: {
    id: 'subject-a',
    organizationId: 'org-a',
    userId: 'user-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['projects.read', 'projects.detail.read'],
    assignedProjectIds: ['project-a'],
  },
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'ready',
    role: 'Project Officer',
    assignedProjectIds: state.profile.assignedProjectIds,
    profile: state.profile,
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class extends Error {
    constructor(
      message: string,
      readonly code?: string,
      readonly fieldErrors: unknown[] = [],
      readonly status?: number,
    ) {
      super(message)
    }
  },
}))

const { PathwaysClientError } = await import('@/lib/services/pathways-client')

type Read = (signal: AbortSignal) => Promise<string>
const Reader = ({
  resource,
  read,
  freshness,
}: {
  resource: string
  read: Read
  freshness?: 'summary' | 'live'
}) => {
  const value = useAuthorizedRead(resource, 'project-a', 'projects.read', read, true, {
    freshness,
  })
  return <output>{value.data ?? 'No current data'}</output>
}

/** One provider for the whole session; `show` mounts or unmounts the reader only. */
const session = (client: QueryClient) =>
  function Session({
    show,
    resource,
    read,
    freshness = 'summary',
  }: {
    show: boolean
    resource: string
    read: Read
    freshness?: 'summary' | 'live'
  }) {
    return (
      <QueryClientProvider client={client}>
        <AuthorizedQueryProvider>
          {show ? <Reader freshness={freshness} read={read} resource={resource} /> : <p>Away</p>}
        </AuthorizedQueryProvider>
      </QueryClientProvider>
    )
  }

beforeEach(() => {
  state.profile = {
    id: 'subject-a',
    organizationId: 'org-a',
    userId: 'user-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['projects.read', 'projects.detail.read'],
    assignedProjectIds: ['project-a'],
  }
})
afterEach(cleanup)

describe('summary cache policy (performance CR step 2)', () => {
  it('keeps list and summary reads for 30 seconds; every other read stays live', () => {
    expect(SUMMARY_READ_STALE_MS).toBe(30_000)
    expect(authorizedReadPolicy('projects', 'summary')).toEqual({
      staleTime: 30_000,
      gcTime: 30_000,
      refetchOnMount: true,
    })
    expect(authorizedReadPolicy('activity-detail:a', 'live')).toEqual({
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: 'always',
    })
  })

  it.each([
    'beneficiary-detail:subject',
    'beneficiaries-directory',
    'step-up-status',
    'import-batch-status:batch',
  ])('never caches %s, even when a caller asks for the summary window', (resource) => {
    expect(authorizedReadPolicy(resource, 'summary')).toEqual({
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: 'always',
    })
  })

  it('keys every read by organization, user, role, permissions, assignments and project', async () => {
    const client = new QueryClient()
    const Session = session(client)
    render(<Session read={async () => 'Cached value'} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    const [key] = client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
    expect(key?.[0]).toBe('pathways-private')
    expect(key?.[2]).toBe('projects')
    expect(key?.[3]).toBe('project-a')
    expect(JSON.parse(String(key?.[1]))).toEqual(
      expect.arrayContaining([
        'subject-a',
        'org-a',
        'user-a',
        ['PROJECT_OFFICER'],
        ['projects.detail.read', 'projects.read'],
        ['project-a'],
      ]),
    )
  })

  it('reuses a summary read when its view remounts inside the window', async () => {
    const Session = session(new QueryClient())
    const read = vi.fn(async () => 'Cached value')
    const view = render(<Session read={read} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    view.rerender(<Session read={read} resource="projects" show={false} />)
    view.rerender(<Session read={read} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    expect(read).toHaveBeenCalledOnce()
  })

  it('re-verifies a Beneficiary read on every mount (explicit, tested opt-out)', async () => {
    const Session = session(new QueryClient())
    const read = vi.fn(async () => 'Cached value')
    const resource = 'beneficiary-detail:subject'
    const view = render(<Session read={read} resource={resource} show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    view.rerender(<Session read={read} resource={resource} show={false} />)
    view.rerender(<Session read={read} resource={resource} show />)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('re-verifies a live read on every mount by default', async () => {
    const Session = session(new QueryClient())
    const read = vi.fn(async () => 'Cached value')
    const view = render(<Session freshness="live" read={read} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    view.rerender(<Session freshness="live" read={read} resource="projects" show={false} />)
    view.rerender(<Session freshness="live" read={read} resource="projects" show />)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('does not retry a 403 and drops cached reads so they are verified again', async () => {
    const client = new QueryClient()
    const Session = session(client)
    const cached = vi.fn(async () => 'Cached value')
    const denied = vi.fn(async (): Promise<string> => {
      throw new PathwaysClientError('Denied', 'forbidden', [], 403)
    })
    const view = render(<Session read={cached} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    view.rerender(<Session read={denied} resource="activity-list" show />)
    await waitFor(() => expect(denied).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .getAll()
          .some((query) => query.queryKey[2] === 'projects'),
      ).toBe(false),
    )
    expect(denied).toHaveBeenCalledOnce()
    view.rerender(<Session read={cached} resource="projects" show />)
    await waitFor(() => expect(cached).toHaveBeenCalledTimes(2))
  })

  it('treats a 401 the same way', async () => {
    const client = new QueryClient()
    const Session = session(client)
    const unauthorized = vi.fn(async (): Promise<string> => {
      throw new PathwaysClientError('Expired', 'unauthorized', [], 401)
    })
    render(<Session read={unauthorized} resource="projects" show />)
    await waitFor(() => expect(unauthorized).toHaveBeenCalledOnce())
    expect(await screen.findByText('No current data')).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(unauthorized).toHaveBeenCalledOnce()
  })

  it('clears cached reads when any request reports 401/403 through the client signal', async () => {
    const client = new QueryClient()
    const Session = session(client)
    const read = vi.fn(async () => 'Cached value')
    const view = render(<Session read={read} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    view.rerender(<Session read={read} resource="projects" show={false} />)
    act(() => {
      window.dispatchEvent(new Event(AUTHORIZATION_DENIED_EVENT))
    })
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    view.rerender(<Session read={read} resource="projects" show />)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('marks cached reads stale after a committed write so the next mount re-reads', async () => {
    const Session = session(new QueryClient())
    const read = vi.fn(async () => 'Cached value')
    const view = render(<Session read={read} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    view.rerender(<Session read={read} resource="projects" show={false} />)
    act(() => {
      window.dispatchEvent(new Event(WRITE_COMMITTED_EVENT))
    })
    view.rerender(<Session read={read} resource="projects" show />)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('drops every cached read when the workspace organization changes', async () => {
    const client = new QueryClient()
    const Session = session(client)
    const read = vi.fn(async () => 'Cached value')
    const view = render(<Session read={read} resource="projects" show />)
    expect(await screen.findByText('Cached value')).toBeTruthy()
    const oldKey = client.getQueryCache().getAll()[0]?.queryKey ?? []
    state.profile = { ...state.profile, organizationId: 'org-b' }
    view.rerender(<Session read={read} resource="projects" show />)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    expect(client.getQueryData(oldKey)).toBeUndefined()
  })
})

type Handle = { replaceData: (update: (previous: string | undefined) => string) => void }
const Probe = ({
  resource,
  read,
  handle,
}: {
  resource: string
  read: Read
  handle?: { current: Handle | null }
}) => {
  const value = useAuthorizedRead(resource, 'project-a', 'projects.read', read, true, {
    freshness: 'summary',
  })
  if (handle) handle.current = value
  return (
    <output aria-label={resource}>
      {value.isError
        ? `Error:${(value.error as { code?: string } | null)?.code ?? 'unknown'}`
        : value.isPending
          ? 'Pending'
          : (value.data ?? 'Empty')}
    </output>
  )
}
const probeTree = (client: QueryClient, children: React.ReactNode) => (
  <QueryClientProvider client={client}>
    <AuthorizedQueryProvider>{children}</AuthorizedQueryProvider>
  </QueryClientProvider>
)
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 30)))
const text = (name: string) => screen.getByRole('status', { name }).textContent

describe('authorization denial keeps every reader in a defined state (G1)', () => {
  it('re-verifies a mounted reader once after an external 401/403 and hides the old value', async () => {
    const client = new QueryClient()
    const read = vi.fn<Read>().mockResolvedValueOnce('Before').mockResolvedValue('After')
    render(probeTree(client, <Probe read={read} resource="projects" />))
    expect(await screen.findByText('Before')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new Event(AUTHORIZATION_DENIED_EVENT))
    })
    expect(screen.queryByText('Before')).toBeNull()
    expect(await screen.findByText('After')).toBeTruthy()
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('ends in an error with a forbidden code when the re-verification is denied, without looping', async () => {
    const client = new QueryClient()
    const read = vi
      .fn<Read>()
      .mockResolvedValueOnce('Before')
      .mockRejectedValue(new PathwaysClientError('Denied', 'forbidden', [], 403))
    render(probeTree(client, <Probe read={read} resource="projects" />))
    expect(await screen.findByText('Before')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new Event(AUTHORIZATION_DENIED_EVENT))
    })
    expect(await screen.findByText('Error:forbidden')).toBeTruthy()
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Before')).toBeNull()
  })

  it('does not loop on a persistent 403; a sibling reader re-reads at most once', async () => {
    const client = new QueryClient()
    const denied = vi
      .fn<Read>()
      .mockRejectedValue(new PathwaysClientError('No', 'forbidden', [], 403))
    const sibling = vi.fn<Read>().mockResolvedValue('Sibling')
    render(
      probeTree(
        client,
        <>
          <Probe read={sibling} resource="projects" />
          <Probe read={denied} resource="project-activities" />
        </>,
      ),
    )
    expect(await screen.findByText('Error:forbidden')).toBeTruthy()
    await waitFor(() => expect(text('projects')).toBe('Sibling'))
    await settle()
    await settle()
    expect(denied).toHaveBeenCalledOnce()
    expect(sibling.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('never hands masked pre-denial data to replaceData', async () => {
    const client = new QueryClient()
    const handle: { current: Handle | null } = { current: null }
    const read = vi
      .fn<Read>()
      .mockResolvedValueOnce('Pre-denial secret')
      .mockImplementation(() => new Promise<string>(() => undefined))
    render(probeTree(client, <Probe handle={handle} read={read} resource="projects" />))
    expect(await screen.findByText('Pre-denial secret')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new Event(AUTHORIZATION_DENIED_EVENT))
    })
    expect(await screen.findByText('Pending')).toBeTruthy()
    const seen: Array<string | undefined> = []
    act(() =>
      handle.current?.replaceData((previous) => {
        seen.push(previous)
        return 'Saved record'
      }),
    )
    expect(seen).toEqual([undefined])
    expect(await screen.findByText('Saved record')).toBeTruthy()
    expect(screen.queryByText('Pre-denial secret')).toBeNull()
  })
})

describe('committed writes (G1)', () => {
  it('re-reads a mounted reader and never shows the pre-write value on a later remount', async () => {
    const client = new QueryClient()
    const read = vi.fn<Read>().mockResolvedValueOnce('Pre-write').mockResolvedValue('Post-write')
    const Page = ({ show }: { show: boolean }) =>
      probeTree(client, show ? <Probe read={read} resource="projects" /> : <p>Away</p>)
    const view = render(<Page show />)
    expect(await screen.findByText('Pre-write')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new Event(WRITE_COMMITTED_EVENT))
    })
    expect(await screen.findByText('Post-write')).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)

    const later = vi.fn<Read>().mockResolvedValueOnce('Old').mockResolvedValue('New')
    const Later = ({ show }: { show: boolean }) =>
      probeTree(client, show ? <Probe read={later} resource="project-overview" /> : <p>Away</p>)
    view.rerender(<Later show />)
    expect(await screen.findByText('Old')).toBeTruthy()
    view.rerender(<Later show={false} />)
    act(() => {
      window.dispatchEvent(new Event(WRITE_COMMITTED_EVENT))
    })
    await settle()
    view.rerender(<Later show />)
    expect(screen.queryByText('Old')).toBeNull()
    expect(await screen.findByText('New')).toBeTruthy()
  })
})

const forbidden = () => new PathwaysClientError('Denied', 'forbidden', [], 403)
const Child = ({ read, freshness }: { read: Read; freshness: 'summary' | 'live' }) => {
  const value = useAuthorizedRead(
    'project-overview-metrics',
    'project-a',
    'projects.read',
    read,
    true,
    {
      freshness,
    },
  )
  return (
    <div>
      <output aria-label="child">
        {value.isError
          ? `Error:${(value.error as { code?: string } | null)?.code ?? 'unknown'}`
          : value.isPending
            ? 'Pending'
            : (value.data ?? 'Empty')}
      </output>
      <button onClick={() => void value.refetch()} type="button">
        Retry child
      </button>
    </div>
  )
}
/** A parent gated on its own read renders the child only once its data is visible. */
const GatedParent = ({
  parentRead,
  childRead,
  freshness,
  renders,
}: {
  parentRead: Read
  childRead: Read
  freshness: 'summary' | 'live'
  renders: string[]
}) => {
  const project = useAuthorizedRead('project', 'project-a', 'projects.read', parentRead, true, {
    freshness: 'summary',
  })
  renders.push(project.data ? 'content' : 'loading')
  return project.data ? (
    <section>
      <h2>{project.data}</h2>
      <Child freshness={freshness} read={childRead} />
    </section>
  ) : (
    <p>Loading parent</p>
  )
}

describe('a persistently denied reader does not loop when it remounts (G1)', () => {
  it.each(['summary', 'live'] as const)(
    'settles a %s child 403 under a gated parent without a flicker loop',
    async (freshness) => {
      const client = new QueryClient()
      const parentRead = vi.fn<Read>().mockResolvedValue('Project A')
      const childRead = vi.fn<Read>().mockRejectedValue(forbidden())
      const renders: string[] = []
      render(
        probeTree(
          client,
          <GatedParent
            childRead={childRead}
            freshness={freshness}
            parentRead={parentRead}
            renders={renders}
          />,
        ),
      )
      await waitFor(() => expect(text('child')).toBe('Error:forbidden'))
      await settle()
      await settle()
      await settle()
      expect(childRead).toHaveBeenCalledOnce()
      expect(parentRead.mock.calls.length).toBeLessThanOrEqual(2)
      expect(screen.getByRole('heading', { name: 'Project A' })).toBeTruthy()
      expect(text('child')).toBe('Error:forbidden')
      // At most one loading gap after the first content (the single re-verification).
      const gaps = renders
        .slice(renders.indexOf('content'))
        .filter((state, index, all) => state === 'loading' && all[index - 1] === 'content')
      expect(gaps.length).toBeLessThanOrEqual(1)
    },
  )

  it('clears the sticky denial on an explicit retry and requests exactly once', async () => {
    const client = new QueryClient()
    const parentRead = vi.fn<Read>().mockResolvedValue('Project A')
    const childRead = vi.fn<Read>().mockRejectedValue(forbidden())
    render(
      probeTree(
        client,
        <GatedParent childRead={childRead} freshness="live" parentRead={parentRead} renders={[]} />,
      ),
    )
    await waitFor(() => expect(text('child')).toBe('Error:forbidden'))
    await settle()
    expect(childRead).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Retry child' }))
    await waitFor(() => expect(childRead).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(text('child')).toBe('Error:forbidden'))
    await settle()
    await settle()
    expect(childRead).toHaveBeenCalledTimes(2)

    childRead.mockResolvedValue('Metrics')
    fireEvent.click(screen.getByRole('button', { name: 'Retry child' }))
    await waitFor(() => expect(text('child')).toBe('Metrics'))
    expect(childRead).toHaveBeenCalledTimes(3)
  })

  it('raises the epoch once per denial: the same denial token is not counted twice', async () => {
    const client = new QueryClient()
    const read = vi.fn<Read>().mockResolvedValue('Value')
    render(probeTree(client, <Probe read={read} resource="projects" />))
    expect(await screen.findByText('Value')).toBeTruthy()
    const token = forbidden()
    act(() => {
      window.dispatchEvent(new CustomEvent(AUTHORIZATION_DENIED_EVENT, { detail: token }))
    })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Value')).toBeTruthy()
    act(() => {
      window.dispatchEvent(new CustomEvent(AUTHORIZATION_DENIED_EVENT, { detail: token }))
    })
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    act(() => {
      window.dispatchEvent(new CustomEvent(AUTHORIZATION_DENIED_EVENT, { detail: forbidden() }))
    })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3))
  })
})
