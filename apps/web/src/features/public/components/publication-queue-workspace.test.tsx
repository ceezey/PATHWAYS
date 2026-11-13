import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicationQueueWorkspace } from './publication-queue-workspace'

const state = vi.hoisted(() => ({
  user: 'reviewer-1',
  projectsError: false,
  projectsPending: false,
  publicationError: false,
  canApprove: true,
  canPublish: true,
  publicationState: 'FOR_REVIEW',
  liveRevision: null as number | null,
  noPublication: false,
  snapshotMedia: [] as object[],
  snapshotViews: [] as string[],
  submittedBy: 'another-reviewer',
  capturedOwnerInvalid: false,
  transition: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  refetch: vi.fn(),
}))
const projectId = '10000000-0000-4000-8000-000000000001'
vi.mock('@/lib/auth/sensitive-drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/sensitive-drafts')>()
  return {
    ...actual,
    useSensitiveDraftOwner: (...args: Parameters<typeof actual.useSensitiveDraftOwner>) => {
      const owner = actual.useSensitiveDraftOwner(...args)
      return (
        owner && {
          ...owner,
          // A controlled timing seam: authority can become stale before passive cleanup runs.
          isCurrent: () => owner.isCurrent() && !state.capturedOwnerInvalid,
        }
      )
    },
  }
})
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'fictional-org',
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: [
        'public.preview',
        ...(state.canApprove ? ['public.approve'] : []),
        ...(state.canPublish ? ['public.publish'] : []),
      ],
      assignedProjectIds: [projectId],
    },
  }),
}))
vi.mock('@/lib/api/publication', () => ({
  publicationClient: {
    transition: (...args: unknown[]) => state.transition(...args),
  },
}))
vi.mock('@/lib/api/projects', () => ({ projectsClient: { getProjects: vi.fn() } }))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (key: string) => ({
    // Retain the old authorized data while reporting failure to stress the renderer gate.
    data:
      key === 'publication-projects'
        ? [
            {
              id: projectId,
              title: 'Private project title',
              area: 'Private area',
              sector: 'Private sector',
            },
          ]
        : state.noPublication
          ? null
          : {
              revision: 1,
              state: state.publicationState,
              summary: 'Private proposed summary',
              snapshot: { media: state.snapshotMedia, views: state.snapshotViews },
              live: state.liveRevision
                ? { revision: state.liveRevision, publishedAt: '2026-09-27T00:00:00.000Z' }
                : null,
              submittedById: state.submittedBy,
              approvedById: null,
              publishedById: null,
            },
    isPending: key === 'publication-projects' && state.projectsPending,
    isError: key === 'publication-projects' ? state.projectsError : state.publicationError,
    refetch: state.refetch,
  }),
}))
const pickedId = '20000000-0000-4000-8000-000000000009'
// A stand-in picker: the real one has its own tests, here only the selection wiring matters.
vi.mock('./public-media-picker', () => ({
  PublicMediaPicker: ({
    onBlockedChange,
    onChange,
    value,
  }: {
    onBlockedChange: (blocked: boolean) => void
    onChange: (next: { id: string; caption: string }[]) => void
    value: { id: string; caption: string }[]
  }) => (
    <div>
      <button type="button" onClick={() => onBlockedChange(true)}>
        Report unpublishable media
      </button>
      <output aria-label="Picked media">{JSON.stringify(value)}</output>
      <button type="button" onClick={() => onChange([...value, { id: pickedId, caption: 'New' }])}>
        Pick media
      </button>
      <button type="button" onClick={() => onChange([...value, { id: pickedId, caption: ' ' }])}>
        Pick media without caption
      </button>
    </div>
  ),
}))
vi.mock('./public-media-queue', () => ({
  PublicMediaQueue: ({ projectId: id }: { projectId: string }) => <p>Queue for {id}</p>,
}))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => state.success(...args),
    error: (...args: unknown[]) => state.error(...args),
  },
}))

// Submit needs a change from the saved revision, so submitting tests edit the summary first.
const editSummary = (value = 'Edited fictional summary') =>
  fireEvent.change(screen.getByLabelText('Public summary'), { target: { value } })
const submitDisabled = () =>
  (screen.getByRole('button', { name: 'Submit summary' }) as HTMLButtonElement).disabled
// The editor is released (not busy) once the summary field is editable again.
const summaryEditable = () =>
  !(screen.getByLabelText('Public summary') as HTMLTextAreaElement).disabled

describe('publication current project and revision boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'reviewer-1'
    state.projectsError = false
    state.projectsPending = false
    state.publicationError = false
    state.canApprove = true
    state.canPublish = true
    state.publicationState = 'FOR_REVIEW'
    state.liveRevision = null
    state.noPublication = false
    state.snapshotMedia = []
    state.snapshotViews = []
    state.submittedBy = 'another-reviewer'
    state.capturedOwnerInvalid = false
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)
  it('exposes the selected project to assistive technology', () => {
    render(<PublicationQueueWorkspace />)
    const project = screen.getByRole('button', { name: 'Private project title' })
    expect(project.getAttribute('aria-pressed')).toBe('true')
  })
  it.each(['error', 'pending'] as const)(
    'hides cached title, summary and actions when parent verification is %s',
    (boundary) => {
      const view = render(<PublicationQueueWorkspace />)
      expect((screen.getByLabelText('Public summary') as HTMLTextAreaElement).value).toBe(
        'Private proposed summary',
      )
      state.projectsError = boundary === 'error'
      state.projectsPending = boundary === 'pending'
      view.rerender(<PublicationQueueWorkspace />)
      expect(screen.queryAllByText('Private project title')).toHaveLength(0)
      expect(screen.queryByLabelText('Public summary')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Approve revision' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Submit summary' })).toBeNull()
      expect(state.transition).not.toHaveBeenCalled()
    },
  )
  it('disables approval for the reviewer who submitted the revision (QAD-T74)', () => {
    state.submittedBy = state.user
    render(<PublicationQueueWorkspace />)
    const approve = screen.getByRole('button', { name: 'Approve revision' }) as HTMLButtonElement
    expect(approve.disabled).toBe(true)
  })
  it('does not expose cached publication data when its own current read fails', () => {
    const view = render(<PublicationQueueWorkspace />)
    state.publicationError = true
    view.rerender(<PublicationQueueWorkspace />)
    expect(screen.queryByLabelText('Public summary')).toBeNull()
    expect(screen.queryByText('Revision 1')).toBeNull()
    expect(screen.getByText('Publication unavailable')).toBeTruthy()
  })
  const confirmPublish = () =>
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Publish this revision?' })).getByRole('button', {
        name: 'Publish revision',
      }),
    )

  it('asks for confirmation before publishing and publishes only on confirm (UC025 A3.2)', async () => {
    state.publicationState = 'APPROVED'
    state.transition.mockResolvedValue({ revision: 1, state: 'PUBLISHED' })
    render(<PublicationQueueWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    const dialog = screen.getByRole('dialog', { name: 'Publish this revision?' })
    expect(
      within(dialog).getByText(
        'Revision 1 goes live on the public tracker, where anyone can see it. You can withdraw it later.',
      ),
    ).toBeTruthy()
    expect(state.transition).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.transition).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    confirmPublish()
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Approved revision published.'))
    expect(state.transition).toHaveBeenCalledOnce()
    expect(state.transition.mock.calls[0][0]).toBe(projectId)
    expect(state.transition.mock.calls[0][1]).toBe('publish')
    expect(state.transition.mock.calls[0][2]).toMatchObject({ expectedRevision: 1 })
  })

  it('disables the confirm button when publish access is lost while the dialog is open', () => {
    state.publicationState = 'APPROVED'
    const view = render(<PublicationQueueWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    state.canPublish = false
    view.rerender(<PublicationQueueWorkspace />)
    const confirm = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Publish revision',
    }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(state.transition).not.toHaveBeenCalled()
  })

  it.each(['approve', 'publish'] as const)(
    'drops a delayed %s completion when only that purpose grant is revoked',
    async (purpose) => {
      let finish: (value: unknown) => void = () => {}
      state.transition.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      state.publicationState = purpose === 'approve' ? 'FOR_REVIEW' : 'APPROVED'
      const view = render(<PublicationQueueWorkspace />)
      fireEvent.click(
        screen.getByRole('button', {
          name: purpose === 'approve' ? 'Approve revision' : 'Publish',
        }),
      )
      if (purpose === 'publish') confirmPublish()
      if (purpose === 'approve') state.canApprove = false
      else state.canPublish = false
      view.rerender(<PublicationQueueWorkspace />)
      expect(summaryEditable()).toBe(true)
      await act(async () =>
        finish({ revision: 1, state: purpose === 'approve' ? 'APPROVED' : 'PUBLISHED' }),
      )
      expect(state.success).not.toHaveBeenCalled()
      expect(state.refetch).not.toHaveBeenCalled()
    },
  )
  it('retries the exact revision and normalized body after an uncertain response', async () => {
    state.transition
      .mockRejectedValueOnce(Error('Response lost'))
      .mockResolvedValue({ revision: 2, state: 'FOR_REVIEW' })
    render(<PublicationQueueWorkspace />)
    fireEvent.change(screen.getByLabelText('Public summary'), {
      target: { value: '  Updated fictional summary  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.transition.mock.calls[1]).toEqual(state.transition.mock.calls[0])
    expect(state.transition.mock.calls[0][2]).toMatchObject({
      expectedRevision: 1,
      summary: 'Updated fictional summary',
    })
  })
  it('keeps a current submit pending when an unrelated approval grant changes', async () => {
    let finish: (value: unknown) => void = () => {}
    state.transition.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<PublicationQueueWorkspace />)
    editSummary()
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    state.canApprove = false
    view.rerender(<PublicationQueueWorkspace />)
    expect(submitDisabled()).toBe(true)
    expect(summaryEditable()).toBe(false)
    await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
    expect(state.success).toHaveBeenCalledOnce()
    expect(summaryEditable()).toBe(true)
  })
  it('releases only its pending marker when authority is invalidated before passive cleanup', async () => {
    let finish: (value: unknown) => void = () => {}
    state.transition.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<PublicationQueueWorkspace />)
    editSummary()
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
      true,
    )
    // Do not rerender an owner dependency: the completion arrives before its cleanup effect.
    state.capturedOwnerInvalid = true
    await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
    expect(state.refetch).not.toHaveBeenCalled()
    expect(state.success).not.toHaveBeenCalled()
    expect(state.error).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
      false,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    expect(state.transition).toHaveBeenCalledOnce()
  })
  it('suppresses an old completion after parent denial and clears its private draft and busy state', async () => {
    let finish: (value: unknown) => void = () => {}
    state.transition.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<PublicationQueueWorkspace />)
    fireEvent.change(screen.getByLabelText('Public summary'), {
      target: { value: 'Old private draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    state.projectsError = true
    view.rerender(<PublicationQueueWorkspace />)
    await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
    expect(state.success).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
    state.projectsError = false
    view.rerender(<PublicationQueueWorkspace />)
    expect((screen.getByLabelText('Public summary') as HTMLTextAreaElement).value).toBe(
      'Private proposed summary',
    )
    expect(summaryEditable()).toBe(true)
  })
  it('disables submit until something differs from the saved revision, and again after undo', () => {
    render(<PublicationQueueWorkspace />)
    expect(submitDisabled()).toBe(true)
    editSummary('Changed fictional summary')
    expect(submitDisabled()).toBe(false)
    editSummary('Private proposed summary  ')
    expect(submitDisabled()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Pick media' }))
    expect(submitDisabled()).toBe(false)
  })
  it('submit is enabled while published once edited', async () => {
    state.publicationState = 'PUBLISHED'
    state.liveRevision = 1
    state.transition.mockResolvedValue({ revision: 2, state: 'FOR_REVIEW' })
    render(<PublicationQueueWorkspace />)
    expect(summaryEditable()).toBe(true)
    editSummary()
    const submit = screen.getByRole('button', { name: 'Submit summary' }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => expect(state.transition).toHaveBeenCalledOnce())
    expect(state.transition.mock.calls[0][2]).toMatchObject({
      selection: { media: [], views: [] },
    })
  })
  it('sends the summary and an empty selection on the first submit of a project', async () => {
    state.noPublication = true
    state.transition.mockResolvedValue({ revision: 1, state: 'FOR_REVIEW' })
    render(<PublicationQueueWorkspace />)
    fireEvent.change(screen.getByLabelText('Public summary'), {
      target: { value: 'First fictional summary' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    await waitFor(() => expect(state.transition).toHaveBeenCalledOnce())
    expect(state.transition.mock.calls[0][2]).toMatchObject({
      expectedRevision: 0,
      summary: 'First fictional summary',
      selection: { media: [], views: [] },
    })
  })
  it('disables submit while the picker reports an unpublishable chosen item', () => {
    render(<PublicationQueueWorkspace />)
    editSummary()
    const submit = () => screen.getByRole('button', { name: 'Submit summary' }) as HTMLButtonElement
    expect(submit().disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Report unpublishable media' }))
    expect(submit().disabled).toBe(true)
  })
  it('sends each picked photo as id and caption only', async () => {
    state.snapshotMedia = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        type: 'PHOTO',
        contentType: 'image/jpeg',
        caption: 'A fictional caption',
      },
    ]
    state.snapshotViews = ['kpi', 'map']
    state.transition.mockResolvedValue({ revision: 2, state: 'FOR_REVIEW' })
    render(<PublicationQueueWorkspace />)
    editSummary()
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    await waitFor(() => expect(state.transition).toHaveBeenCalledOnce())
    expect(state.transition.mock.calls[0][2].selection).toEqual({
      media: [{ id: '20000000-0000-4000-8000-000000000001', caption: 'A fictional caption' }],
      views: ['kpi', 'map'],
    })
  })
  it('seeds the picker from the latest snapshot and shows the media queue', () => {
    state.snapshotMedia = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        type: 'PHOTO',
        contentType: 'image/jpeg',
        caption: 'Seeded',
      },
    ]
    render(<PublicationQueueWorkspace />)
    expect(screen.getByLabelText('Picked media').textContent).toBe(
      JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', caption: 'Seeded' }]),
    )
    expect(screen.getByText(`Queue for ${projectId}`)).toBeTruthy()
  })
  it('sends the edited selection and keeps the snapshot views', async () => {
    state.snapshotViews = ['kpi']
    state.transition.mockResolvedValue({ revision: 2, state: 'FOR_REVIEW' })
    render(<PublicationQueueWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Pick media' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    await waitFor(() => expect(state.transition).toHaveBeenCalledOnce())
    expect(state.transition.mock.calls[0][2].selection).toEqual({
      media: [{ id: pickedId, caption: 'New' }],
      views: ['kpi'],
    })
  })
  it('disables approval and publishing while the selection is edited', () => {
    state.publicationState = 'FOR_REVIEW'
    const view = render(<PublicationQueueWorkspace />)
    const approve = () =>
      (screen.getByRole('button', { name: 'Approve revision' }) as HTMLButtonElement).disabled
    expect(approve()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Pick media' }))
    expect(approve()).toBe(true)
    view.unmount()
    state.publicationState = 'APPROVED'
    render(<PublicationQueueWorkspace />)
    const publish = () =>
      (screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled
    expect(publish()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Pick media' }))
    expect(publish()).toBe(true)
  })
  describe('chart views', () => {
    const labels = [
      'KPI / indicator performance',
      'SADDD (sex, age, disability)',
      'Participation patterns',
      'Timeline adherence',
      'Project coverage map',
    ]
    const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
    it('lists the snapshot views first in their public order, then the unticked ones', () => {
      state.snapshotViews = ['map', 'kpi']
      render(<PublicationQueueWorkspace />)
      expect(
        screen.getAllByRole('checkbox').map((input) => input.closest('label')?.textContent),
      ).toEqual([labels[4], labels[0], labels[1], labels[2], labels[3]])
      expect(labels.map((name) => box(name).checked)).toEqual([true, false, false, false, true])
    })
    it('pre-checks the view from Add to public page and submits it last', async () => {
      state.snapshotViews = ['map']
      state.transition.mockResolvedValue({ revision: 2, state: 'FOR_REVIEW' })
      render(<PublicationQueueWorkspace initialProjectId={projectId} initialAddView="kpi" />)
      expect(box('KPI / indicator performance').checked).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
      await waitFor(() => expect(state.transition).toHaveBeenCalledOnce())
      expect(state.transition.mock.calls[0][2].selection.views).toEqual(['map', 'kpi'])
    })
    it('removes an unchecked view and appends a checked one', async () => {
      state.snapshotViews = ['kpi', 'map']
      state.transition.mockResolvedValue({ revision: 2, state: 'FOR_REVIEW' })
      render(<PublicationQueueWorkspace />)
      fireEvent.click(box('KPI / indicator performance'))
      fireEvent.click(box('Timeline adherence'))
      fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
      await waitFor(() => expect(state.transition).toHaveBeenCalledOnce())
      expect(state.transition.mock.calls[0][2].selection.views).toEqual(['map', 'timeline'])
    })
    it('lets the pre-added view be unchecked, which leaves nothing to submit', () => {
      render(<PublicationQueueWorkspace initialProjectId={projectId} initialAddView="kpi" />)
      expect(submitDisabled()).toBe(false)
      fireEvent.click(box('KPI / indicator performance'))
      expect(box('KPI / indicator performance').checked).toBe(false)
      expect(submitDisabled()).toBe(true)
    })
    it('disables approval and publishing until the edited views are resubmitted', () => {
      const view = render(<PublicationQueueWorkspace />)
      const approve = () =>
        (screen.getByRole('button', { name: 'Approve revision' }) as HTMLButtonElement).disabled
      expect(approve()).toBe(false)
      fireEvent.click(box('Participation patterns'))
      expect(approve()).toBe(true)
      view.unmount()
      state.publicationState = 'APPROVED'
      render(<PublicationQueueWorkspace initialProjectId={projectId} initialAddView="saddd" />)
      expect((screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement).disabled).toBe(
        true,
      )
    })
  })
  it('disables submit while a picked item has a blank caption', () => {
    render(<PublicationQueueWorkspace />)
    editSummary()
    const submit = () =>
      (screen.getByRole('button', { name: 'Submit summary' }) as HTMLButtonElement).disabled
    expect(submit()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Pick media without caption' }))
    expect(submit()).toBe(true)
  })
  it('shows the live revision beside the working one', () => {
    state.liveRevision = 2
    render(<PublicationQueueWorkspace />)
    expect(screen.getByText('Live: revision 2')).toBeTruthy()
    expect(screen.getByText('For review')).toBeTruthy()
  })
  it('shows withdraw whenever a live revision exists', () => {
    const view = render(<PublicationQueueWorkspace />)
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull()
    state.liveRevision = 2
    view.rerender(<PublicationQueueWorkspace />)
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy()
  })
  it('describes what the submitter chooses and who approves it', () => {
    render(<PublicationQueueWorkspace />)
    expect(
      screen.getByText(
        'Choose the summary, photos, videos and charts the public page shows. Changes go live only after a different reviewer approves them.',
      ),
    ).toBeTruthy()
  })
  it.each(['identity', 'generation'] as const)(
    'drops callbacks and clears the draft when %s changes',
    async (boundary) => {
      let finish: (value: unknown) => void = () => {}
      state.transition.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      const view = render(<PublicationQueueWorkspace />)
      fireEvent.change(screen.getByLabelText('Public summary'), {
        target: { value: 'Actor one draft' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
      if (boundary === 'identity') state.user = 'reviewer-2'
      else act(() => clearSensitiveDraftStorage())
      view.rerender(<PublicationQueueWorkspace />)
      await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
      expect(state.success).not.toHaveBeenCalled()
      expect(state.refetch).not.toHaveBeenCalled()
      expect((screen.getByLabelText('Public summary') as HTMLTextAreaElement).value).toBe(
        'Private proposed summary',
      )
    },
  )
})
