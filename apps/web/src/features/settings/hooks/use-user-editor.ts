import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { useCurrentRole } from '@/hooks/use-current-role'
import { usePendingCreate } from '@/hooks/use-pending-create'
import { usersClient } from '@/lib/api/users'
import { createdSince, fingerprintOf } from '@/lib/forms/pending-create'
import type { ProjectSummary, UserRecord } from '@/types/pathways'
import {
  type UserEditorState,
  canManageUserRecord,
  emptyEditor,
  getAssignableProjects,
  getManageableUserRoles,
  isProjectAssignableRole,
} from '../settings.utils'

import type { Dispatch, SetStateAction } from 'react'

const AUTH_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CurrentRole = ReturnType<typeof useCurrentRole>

export const useUserEditor = ({
  actorRole,
  profile,
  assignedProjectIds,
  users,
  setUsers,
  projects,
  setLoadAttempt,
}: {
  actorRole: CurrentRole['role']
  profile: CurrentRole['profile']
  assignedProjectIds: CurrentRole['assignedProjectIds']
  users: UserRecord[]
  setUsers: Dispatch<SetStateAction<UserRecord[]>>
  projects: ProjectSummary[]
  setLoadAttempt: Dispatch<SetStateAction<number>>
}) => {
  const [editor, setEditor] = useState<UserEditorState | null>(null)
  const [editorError, setEditorError] = useState('')
  const pendingCreate = usePendingCreate<UserRecord>({
    profile,
    kind: 'user',
    successMessage: 'Account authorized',
    findCreated: async (fingerprint, startedAt) =>
      (await usersClient.getUsers()).find(
        (user) =>
          fingerprintOf(user.authUserId) === fingerprint && createdSince(user.createdAt, startedAt),
      ),
    onConfirmed: () => {
      setLoadAttempt((attempt) => attempt + 1)
      setEditor(null)
    },
  })
  const manageableRoles = useMemo(
    () => (actorRole ? getManageableUserRoles(actorRole) : []),
    [actorRole],
  )
  const canCreateUsers =
    profile?.permissions.includes('users.authorize') && manageableRoles.length > 0
  const assignableProjects = useMemo(
    () =>
      actorRole && editor
        ? getAssignableProjects(actorRole, editor.role, projects, assignedProjectIds)
        : projects,
    [actorRole, projects, editor, assignedProjectIds],
  )

  const openCreate = () => {
    const defaultRole = manageableRoles[0]

    if (!defaultRole) {
      return
    }

    setEditor(emptyEditor(defaultRole))
    setEditorError('')
  }

  const openEdit = (user: UserRecord) => {
    if (
      !actorRole ||
      !profile?.permissions.includes('users.authorize') ||
      !canManageUserRecord(actorRole, user, assignedProjectIds)
    ) {
      return
    }

    setEditor({
      mode: 'edit',
      userId: user.id,
      name: user.name,
      email: user.email,
      authUserId: user.authUserId ?? '',
      role: user.role,
      signInMethod: user.signInMethod,
      projectIds: [...user.projectIds],
    })
    setEditorError('')
  }

  const saveEditor = async () => {
    if (!editor) return

    const name = editor.name.trim()
    const selectedProjectIds = [...new Set(editor.projectIds)]
    const allowedProjectIds = new Set(assignableProjects.map((project) => project.id))

    if (!name) {
      setEditorError('Full name is required.')
      return
    }

    if (!manageableRoles.includes(editor.role)) {
      setEditorError('That target role is not available to your current role.')
      return
    }

    if (
      isProjectAssignableRole(editor.role) &&
      selectedProjectIds.some((projectId) => !allowedProjectIds.has(projectId))
    ) {
      setEditorError('One or more selected projects are outside your permitted assignment scope.')
      return
    }

    if (
      isProjectAssignableRole(editor.role) &&
      editor.role !== 'Program Manager' &&
      selectedProjectIds.length === 0
    ) {
      setEditorError('Select at least one permitted project assignment.')
      return
    }

    const projectIds = isProjectAssignableRole(editor.role)
      ? selectedProjectIds
      : (users.find((user) => user.id === editor.userId)?.projectIds ?? [])

    if (editor.mode === 'create') {
      const authUserId = editor.authUserId.trim()
      if (!AUTH_USER_ID_PATTERN.test(authUserId)) {
        setEditorError('Enter the existing Auth user ID (UUID) from Supabase Auth.')
        return
      }
      try {
        const created = await pendingCreate.submit(fingerprintOf(authUserId), () =>
          usersClient.authorizeExistingUser({
            authUserId,
            fullName: name,
            role: editor.role,
            projectIds,
          }),
        )
        if (!created) return
        setLoadAttempt((attempt) => attempt + 1)
        toast.success('Account authorized. Sign-in access is active.')
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : 'Account could not be authorized.')
        return
      }
      setEditor(null)
      setEditorError('')
      return
    }

    const email = editor.email.trim().toLocaleLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEditorError('Enter a valid email address.')
      return
    }

    if (
      users.some((user) => user.email.toLocaleLowerCase() === email && user.id !== editor.userId)
    ) {
      setEditorError('That email already belongs to another user.')
      return
    }

    if (!editor.userId) {
      setEditorError('The selected user is no longer available.')
      return
    }

    try {
      const current = users.find((user) => user.id === editor.userId)
      if (!current) throw new Error('The selected user is no longer available.')
      if (current.email.toLocaleLowerCase() !== email) {
        throw new Error('Changing the Auth email is not supported by this user endpoint.')
      }
      const updated = await usersClient.updateAuthorizedUser(editor.userId, {
        fullName: name,
        role: editor.role,
        accountStatus: current.accountStatus === 'Deactivated' ? 'Deactivated' : 'Active',
        projectIds,
      })
      setUsers((records) => records.map((user) => (user.id === updated.id ? updated : user)))
      toast.success('Account updated. Permissions apply immediately.')
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Account could not be saved.')
      return
    }
    setEditor(null)
    setEditorError('')
  }
  return {
    editor,
    setEditor,
    editorError,
    setEditorError,
    pendingCreate,
    manageableRoles,
    canCreateUsers,
    assignableProjects,
    openCreate,
    openEdit,
    saveEditor,
  }
}
