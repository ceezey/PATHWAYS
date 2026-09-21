'use client'

import { Pencil, Plus, Search, UserRound, UserX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectSummary, UserRecord } from '@/types/pathways'
import { type PathwaysRole, getPathwaysRoleDisplayName } from '@/types/pathways-role'
import {
  canManageUserRecord,
  filterUserRecords,
  getAssignableProjects,
  getManageableUserRoles,
  getUserInitials,
  isProjectAssignableRole,
  userAccountStatusTone,
} from './user-management-utils'

interface EditorState {
  mode: 'create' | 'edit'
  userId?: string
  authUserId: string
  fullName: string
  role: PathwaysRole
  projectIds: string[]
}

export function UserManagementWorkspace() {
  const { assignedProjectIds, role: actorRole } = useCurrentRole()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    if (!actorRole) return
    setLoading(true)
    Promise.all([pathwaysClient.getUsers(), pathwaysClient.getProjects()])
      .then(([nextUsers, nextProjects]) => {
        if (!active) return
        setUsers(nextUsers)
        setProjects(nextProjects)
        setError('')
      })
      .catch(() => {
        if (active) setError('User accounts could not be loaded. Retry from a verified workspace.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [actorRole])

  const manageableRoles = useMemo(
    () => (actorRole ? getManageableUserRoles(actorRole) : []),
    [actorRole],
  )
  const filtered = useMemo(() => filterUserRecords(users, query, 'All'), [query, users])
  const assignableProjects = useMemo(
    () =>
      editor && actorRole
        ? getAssignableProjects(actorRole, editor.role, projects, assignedProjectIds)
        : [],
    [actorRole, assignedProjectIds, editor, projects],
  )

  const openCreate = () => {
    if (!manageableRoles[0]) return
    setEditor({
      mode: 'create',
      authUserId: '',
      fullName: '',
      role: manageableRoles[0],
      projectIds: [],
    })
    setError('')
  }

  const openEdit = (user: UserRecord) => {
    if (!actorRole || !canManageUserRecord(actorRole, user, assignedProjectIds)) return
    setEditor({
      mode: 'edit',
      userId: user.id,
      authUserId: user.authUserId ?? '',
      fullName: user.name,
      role: user.role,
      projectIds: [...user.projectIds],
    })
    setError('')
  }

  const save = async () => {
    if (!editor || !editor.fullName.trim() || !manageableRoles.includes(editor.role)) return
    if (isProjectAssignableRole(editor.role) && editor.projectIds.length === 0) {
      setError('Select at least one project inside your assignment authority.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved =
        editor.mode === 'create'
          ? await pathwaysClient.authorizeExistingUser({
              authUserId: editor.authUserId,
              fullName: editor.fullName.trim(),
              role: editor.role,
              projectIds: editor.projectIds,
            })
          : await pathwaysClient.updateAuthorizedUser(editor.userId ?? '', {
              fullName: editor.fullName.trim(),
              role: editor.role,
              accountStatus: 'Active',
              projectIds: editor.projectIds,
            })
      setUsers((current) => {
        const remaining = current.filter((user) => user.id !== saved.id)
        return [...remaining, saved].sort((a, b) => a.name.localeCompare(b.name))
      })
      setEditor(null)
    } catch {
      setError(
        'The account change was rejected or could not be completed. No local draft was saved.',
      )
    } finally {
      setSaving(false)
    }
  }

  const setAccountStatus = async (user: UserRecord, active: boolean) => {
    setSaving(true)
    setError('')
    try {
      const saved = await pathwaysClient.updateAuthorizedUser(user.id, {
        role: user.role,
        accountStatus: active ? 'Active' : 'Deactivated',
        projectIds: active ? user.projectIds : [],
      })
      setUsers((current) => current.map((item) => (item.id === saved.id ? saved : item)))
    } catch {
      setError('The account status change was rejected or could not be completed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="User Management"
        description="Authorize an existing verified Supabase account and manage its PATHWAYS role and project assignments."
        actions={
          manageableRoles.length ? (
            <Button className="gap-2" onClick={openCreate} type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Authorize account
            </Button>
          ) : null
        }
      />

      {error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <SectionCard
        title="Authorized accounts"
        description="Only accounts and assignments inside your current authority are returned."
      >
        <label className="relative mb-4 block" htmlFor="user-search">
          <Search
            className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            id="user-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, role, or project"
            value={query}
          />
        </label>
        {loading ? (
          <EmptyState
            description="Checking the current workspace."
            icon={UserRound}
            title="Loading accounts"
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            description={
              users.length
                ? 'No account matches this search.'
                : 'No manageable accounts are available.'
            }
            icon={UserRound}
            title="No accounts found"
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {filtered.map((user) => {
              const manageable = Boolean(
                actorRole && canManageUserRecord(actorRole, user, assignedProjectIds),
              )
              return (
                <li
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={user.id}
                >
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      {getUserInitials(user.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{user.name}</p>
                        <StatusBadge tone={userAccountStatusTone(user.accountStatus)}>
                          {user.accountStatus}
                        </StatusBadge>
                      </div>
                      <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {getPathwaysRoleDisplayName(user.role)} · {user.projectAccess.join(', ')}
                      </p>
                    </div>
                  </div>
                  {manageable ? (
                    <div className="flex gap-2">
                      <Button
                        disabled={saving}
                        onClick={() => openEdit(user)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
                      </Button>
                      <Button
                        disabled={saving}
                        onClick={() => {
                          const reactivating = user.accountStatus === 'Deactivated'

                          if (reactivating && isProjectAssignableRole(user.role)) {
                            openEdit(user)
                            return
                          }

                          void setAccountStatus(user, reactivating)
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <UserX className="mr-2 h-4 w-4" aria-hidden="true" />
                        {user.accountStatus === 'Deactivated' ? 'Reactivate' : 'Deactivate'}
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      <Dialog onOpenChange={(open) => !open && setEditor(null)} open={Boolean(editor)}>
        {editor ? (
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editor.mode === 'create' ? 'Authorize existing account' : 'Edit account access'}
              </DialogTitle>
              <DialogDescription>
                PATHWAYS does not create credentials here. The Auth UUID must already belong to a
                verified Supabase account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {editor.mode === 'create' ? (
                <div className="space-y-2">
                  <Label htmlFor="auth-user-id">Supabase Auth user ID</Label>
                  <Input
                    id="auth-user-id"
                    onChange={(event) => setEditor({ ...editor, authUserId: event.target.value })}
                    value={editor.authUserId}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="full-name">Full name</Label>
                <Input
                  id="full-name"
                  maxLength={160}
                  onChange={(event) => setEditor({ ...editor, fullName: event.target.value })}
                  value={editor.fullName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  id="role"
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      role: event.target.value as PathwaysRole,
                      projectIds: [],
                    })
                  }
                  value={editor.role}
                >
                  {manageableRoles.map((role) => (
                    <option key={role} value={role}>
                      {getPathwaysRoleDisplayName(role)}
                    </option>
                  ))}
                </select>
              </div>
              {isProjectAssignableRole(editor.role) ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Active project assignments</legend>
                  {assignableProjects.map((project) => (
                    <label className="flex items-center gap-2 rounded border p-2" key={project.id}>
                      <input
                        checked={editor.projectIds.includes(project.id)}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            projectIds: event.target.checked
                              ? [...editor.projectIds, project.id]
                              : editor.projectIds.filter((id) => id !== project.id),
                          })
                        }
                        type="checkbox"
                      />
                      {project.title}
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                disabled={saving}
                onClick={() => setEditor(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void save()} type="button">
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
