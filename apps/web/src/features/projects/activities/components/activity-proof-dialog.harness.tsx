import type { Activity } from '@/types/pathways'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

import { ActivityProofDialog } from './activity-proof-dialog'

const state = vi.hoisted(() => ({
  profile: {
    organizationId: 'org-a',
    userId: 'actor-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['activities.proof.submit'],
    assignedProjectIds: ['project-a', 'project-b'],
  },
}))
const api = vi.hoisted(() => ({
  getActivityProofUploadLimits: vi.fn(),
  reserveActivityProofUpload: vi.fn(),
  uploadActivityProofFile: vi.fn(),
  finalizeActivityProofFile: vi.fn(),
  getActivity: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: state.profile }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/components/pathways', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))

export const activity = { id: 'activity-a', projectId: 'project-a', progress: 40 } as Activity

export const limits = {
  maxFiles: 10,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
  contentTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ],
}

export const makeFile = (name: string, type: string, size = 1024) =>
  new File([new Uint8Array(size)], name, { type })

export const selectFiles = (files: File[]) =>
  fireEvent.change(screen.getByLabelText(/Upload proof of conduct/), { target: { files } })

export const renderDialog = (onSubmitted = vi.fn(), onOpenChange = vi.fn()) =>
  render(
    <ActivityProofDialog
      activity={activity}
      onOpenChange={onOpenChange}
      onSubmitted={onSubmitted}
      open
    />,
  )
export { api }

export function useProofDialogHarness() {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getActivityProofUploadLimits.mockResolvedValue(limits)
  })
  afterEach(cleanup)
}
