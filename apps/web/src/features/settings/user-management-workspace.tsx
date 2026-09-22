'use client'

import {
  Building2,
  Clock3,
  Eye,
  KeyRound,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  UserX,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import type { ProjectAssignableRole } from '@/lib/rbac/access-matrix'
import { can } from '@/lib/rbac/can'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { ProjectSummary, UserAccountStatus, UserRecord } from '@/types/pathways'
import { type PathwaysRole, getPathwaysRoleDisplayName } from '@/types/pathways-role'
import {
  type UserStatusFilter,
  canManageUserRecord,
  filterUserRecords,
  getAssignableProjects,
  getManageableUserRoles,
  getProjectAccessLabels,
  getUserAdministrationSummary,
  getUserInitials,
  isProjectAssignableRole,
  roleSummaries,
  userAccountStatusTone,
} from './user-management-utils'

type EditorMode = 'create' | 'edit'

interface UserEditorState {
  mode: EditorMode
  userId?: string
  name: string
  email: string
  role: PathwaysRole
  signInMethod: UserRecord['signInMethod']
  projectIds: string[]
}

const emptyEditor = (role: PathwaysRole): UserEditorState => ({
  mode: 'create',
  name: '',
  email: '',
  role,
  signInMethod: 'Supabase account',
  projectIds: [],
})

const formatAccountDate = (value?: string) => {
  if (!value) return 'Not yet active'

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

export const UserManagementWorkspace = ({
  initialProjects = [],
  initialUsers = [],
}: {
  initialProjects?: ProjectSummary[]
  initialUsers?: UserRecord[]
}) => {
  const { labels } = useDisplayLabels()
  const { role: actorRole, profile, assignedProjectIds } = useCurrentRole()
  const [users, setUsers] = useState<UserRecord[]>(initialUsers)
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  useEffect(() => {
    void loadAttempt
    let active = true
    setLoadState('loading')
    void Promise.all([pathwaysClient.getUsers(), pathwaysClient.getProjects()])
      .then(([nextUsers, nextProjects]) => {
        if (!active) return
        setUsers(nextUsers)
        setProjects(nextProjects)
        setLoadState('ready')
      })
      .catch(() => {
        if (active) setLoadState('error')
      })
    return () => {
      active = false
    }
  }, [loadAttempt])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('All')
  const [editor, setEditor] = useState<UserEditorState | null>(null)
  const [viewUserId, setViewUserId] = useState<string | null>(null)
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null)
  const [editorError, setEditorError] = useState('')
  const manageableRoles = useMemo(
    () => (actorRole ? getManageableUserRoles(actorRole) : []),
    [actorRole],
  )
  const canCreateUsers =
    profile?.permissions.includes('users.authorize') && manageableRoles.length > 0
  const administrationSummary = actorRole
    ? getUserAdministrationSummary(actorRole)
    : 'Verifying account administration access.'
  const assignableProjects = useMemo(
    () =>
      actorRole && editor
        ? getAssignableProjects(actorRole, editor.role, projects, assignedProjectIds)
        : projects,
    [actorRole, projects, editor, assignedProjectIds],
  )

  const filteredUsers = useMemo(
    () => filterUserRecords(users, query, statusFilter),
    [query, statusFilter, users],
  )
  const viewUser = users.find((user) => user.id === viewUserId)
  const deactivateUser = users.find((user) => user.id === deactivateUserId)
  const activeCount = users.filter((user) => user.accountStatus === 'Active').length
  const invitedCount = users.filter((user) => user.accountStatus === 'Invited').length
  const deactivatedCount = users.filter((user) => user.accountStatus === 'Deactivated').length

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
      role: user.role,
      signInMethod: user.signInMethod,
      projectIds: [...user.projectIds],
    })
    setEditorError('')
  }

  const saveEditor = async () => {
    if (!editor) return

    const name = editor.name.trim()
    const email = editor.email.trim().toLocaleLowerCase()
    const selectedProjectIds = [...new Set(editor.projectIds)]
    const allowedProjectIds = new Set(assignableProjects.map((project) => project.id))

    if (!name) {
      setEditorError('Full name is required.')
      return
    }

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

    if (isProjectAssignableRole(editor.role) && selectedProjectIds.length === 0) {
      setEditorError('Select at least one permitted project assignment.')
      return
    }

    const projectIds = isProjectAssignableRole(editor.role)
      ? selectedProjectIds
      : (users.find((user) => user.id === editor.userId)?.projectIds ?? [])
    if (editor.mode === 'create' || !editor.userId) {
      setEditorError(
        'Creating an Auth account from this form is unavailable. Authorize an existing Auth user through the approved workflow.',
      )
      return
    }
    try {
      const current = users.find((user) => user.id === editor.userId)
      if (!current) throw new Error('The selected user is no longer available.')
      if (current.email.toLocaleLowerCase() !== email) {
        throw new Error('Changing the Auth email is not supported by this user endpoint.')
      }
      const updated = await pathwaysClient.updateAuthorizedUser(editor.userId, {
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

  const deactivate = async () => {
    if (!deactivateUser) return
    try {
      const updated = await pathwaysClient.updateAuthorizedUser(deactivateUser.id, {
        role: deactivateUser.role,
        accountStatus: 'Deactivated',
        projectIds: deactivateUser.projectIds,
      })
      setUsers((records) => records.map((user) => (user.id === updated.id ? updated : user)))
      setDeactivateUserId(null)
      toast.success('Account deactivated. Sign-in access revoked.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Deactivation failed.')
    }
  }
  const reactivate = async (user: UserRecord) => {
    try {
      const updated = await pathwaysClient.updateAuthorizedUser(user.id, {
        role: user.role,
        accountStatus: 'Active',
        projectIds: user.projectIds,
      })
      setUsers((records) => records.map((record) => (record.id === updated.id ? updated : record)))
      toast.success('Account authorized. Sign-in access is active.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authorization failed.')
    }
  }

  const clearFilters = () => {
    setQuery('')
    setStatusFilter('All')
  }

  if (loadState === 'loading') {
    return (
      <AsyncState
        description="Loading authorized user and project records."
        icon={UsersRound}
        status="loading"
        title="Loading users"
      />
    )
  }

  if (loadState === 'error') {
    return (
      <AsyncState
        description="User records could not be loaded from the service."
        icon={UsersRound}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        status="error"
        title="User records unavailable"
      />
    )
  }

  return (
    <>
      <PageHeader
        editableLabelKey="moduleUserManagement"
        eyebrow="Administration"
        title={labels.moduleUserManagement}
        description={administrationSummary}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canCreateUsers ? (
              <Button className="gap-2" onClick={openCreate} size="sm" type="button">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create user
              </Button>
            ) : null}
          </div>
        }
      />

      <section
        aria-label="User account summary"
        className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"
      >
        <AccountMetric label="Total users" value={users.length} icon={UsersRound} />
        <AccountMetric label="Active" value={activeCount} icon={UserRound} />
        <AccountMetric label="Invited" value={invitedCount} icon={Mail} />
        <AccountMetric label="Deactivated" value={deactivatedCount} icon={UserX} />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard
          title="User accounts"
          description="Search accounts within your administrative authority."
          actions={<StatusBadge tone="neutral">{filteredUsers.length} shown</StatusBadge>}
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="relative" htmlFor="user-management-search">
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                id="user-management-search"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search users, roles, or projects"
                value={query}
              />
              <span className="sr-only">Search users</span>
            </label>
            <Select
              onValueChange={(value) => setStatusFilter(value as UserStatusFilter)}
              value={statusFilter}
            >
              <SelectTrigger aria-label="Filter users by account status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All account states</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Invited">Invited</SelectItem>
                <SelectItem value="Deactivated">Deactivated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredUsers.length > 0 ? (
            <ul
              className="divide-y divide-border rounded-lg border border-border"
              aria-label="User accounts"
            >
              {filteredUsers.map((user) => (
                <UserAccountRow
                  key={user.id}
                  onDeactivate={() => setDeactivateUserId(user.id)}
                  onEdit={() => openEdit(user)}
                  onReactivate={() => reactivate(user)}
                  onView={() => setViewUserId(user.id)}
                  unavailableReason={
                    actorRole &&
                    profile?.permissions.includes('users.authorize') &&
                    canManageUserRecord(actorRole, user, assignedProjectIds)
                      ? undefined
                      : 'Your current role cannot authorize this account or its project scope.'
                  }
                  user={user}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              action={
                <Button onClick={clearFilters} size="sm" type="button" variant="outline">
                  Clear filters
                </Button>
              }
              description="Try a different name, email, role, project, or account state."
              icon={Search}
              title="No users match"
            />
          )}
        </SectionCard>

        <aside className="space-y-4" aria-label="Role profiles and administration links">
          <SectionCard
            title="Role profiles"
            description="Role assignment options and their responsibilities."
          >
            <div className="space-y-3">
              {roleSummaries.map((summary) => {
                const count = users.filter((user) => user.role === summary.role).length

                return (
                  <div
                    className="rounded-sm border border-border bg-surface-subtle p-3"
                    key={summary.role}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold leading-5 text-foreground">
                        {getPathwaysRoleDisplayName(summary.role)}
                      </p>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        {count} {count === 1 ? 'user' : 'users'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {summary.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </SectionCard>

          <SectionCard title="Administration links" description="Related configuration.">
            <div className="grid gap-2">
              {actorRole && can(actorRole, 'settings.view') ? (
                <Button asChild className="justify-start" variant="outline">
                  <Link href="/settings/labels">Edit Labels</Link>
                </Button>
              ) : null}
              <Button asChild className="justify-start" variant="outline">
                <Link href="/alerts/repository">Alerts Repository</Link>
              </Button>
            </div>
          </SectionCard>
        </aside>
      </section>

      <UserEditorDialog
        editor={editor}
        error={editorError}
        manageableRoles={manageableRoles}
        onChange={(next) => {
          setEditor(next)
          setEditorError('')
        }}
        onClose={() => {
          setEditor(null)
          setEditorError('')
        }}
        onSave={saveEditor}
        projects={assignableProjects}
      />

      <UserDetailDialog onClose={() => setViewUserId(null)} user={viewUser} />

      <Dialog
        onOpenChange={(open) => {
          if (!open) setDeactivateUserId(null)
        }}
        open={Boolean(deactivateUser)}
      >
        {deactivateUser ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate account?</DialogTitle>
              <DialogDescription>
                {deactivateUser.name} will lose sign-in access until the account is authorized
                again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setDeactivateUserId(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button onClick={deactivate} type="button" variant="destructive">
                Deactivate account
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

const AccountMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound
  label: string
  value: number
}) => (
  <div className="flex items-center justify-between gap-4 bg-background p-4 sm:p-5">
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
    <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary-subtle text-primary">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  </div>
)

const UserAccountRow = ({
  onDeactivate,
  onEdit,
  onReactivate,
  onView,
  unavailableReason,
  user,
}: {
  onDeactivate: () => void
  onEdit: () => void
  onReactivate: () => void
  onView: () => void
  unavailableReason?: string
  user: UserRecord
}) => (
  <li className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary">
        {getUserInitials(user.name)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-words font-semibold text-foreground">{user.name}</p>
          <StatusBadge tone={userAccountStatusTone(user.accountStatus)}>
            {user.accountStatus}
          </StatusBadge>
        </div>
        <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {getPathwaysRoleDisplayName(user.role)} · {user.projectAccess.join(', ')}
        </p>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
      <Button onClick={onView} size="sm" type="button" variant="outline">
        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
        View
      </Button>
      {unavailableReason ? (
        <Button
          aria-label={`Account actions unavailable for ${user.name}`}
          className="gap-2"
          disabled
          size="sm"
          title={unavailableReason}
          type="button"
          variant="outline"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          View only
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Account actions for ${user.name}`}
              size="icon"
              type="button"
              variant="outline"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Account actions</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Edit user
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.accountStatus !== 'Active' ? (
              <DropdownMenuItem onSelect={onReactivate}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Authorize account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-destructive" onSelect={onDeactivate}>
                <UserX className="mr-2 h-4 w-4" aria-hidden="true" />
                Deactivate account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  </li>
)

const UserEditorDialog = ({
  editor,
  error,
  manageableRoles,
  onChange,
  onClose,
  onSave,
  projects,
}: {
  editor: UserEditorState | null
  error: string
  manageableRoles: PathwaysRole[]
  onChange: (editor: UserEditorState) => void
  onClose: () => void
  onSave: () => void
  projects: ProjectSummary[]
}) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(editor)}>
    {editor ? (
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editor.mode === 'create' ? 'Create user' : 'Edit user'}</DialogTitle>
          <DialogDescription>
            {editor.mode === 'create'
              ? 'Add an invited account and assign its role and project access.'
              : 'Update this account record, role, and project access.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              maxLength={100}
              onChange={(event) => onChange({ ...editor, name: event.target.value })}
              value={editor.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              maxLength={160}
              onChange={(event) => onChange({ ...editor, email: event.target.value })}
              type="email"
              value={editor.email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select
              onValueChange={(value) =>
                onChange({ ...editor, projectIds: [], role: value as PathwaysRole })
              }
              value={editor.role}
            >
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {manageableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {getPathwaysRoleDisplayName(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-sign-in">Sign-in method</Label>
            <Select
              onValueChange={(value) =>
                onChange({ ...editor, signInMethod: value as UserRecord['signInMethod'] })
              }
              value={editor.signInMethod}
            >
              <SelectTrigger id="user-sign-in">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Supabase account">Supabase account</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isProjectAssignableRole(editor.role) ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Project assignments</legend>
              <p className="text-xs leading-5 text-muted-foreground">
                Choose only projects inside your permitted scope.
                {editor.role === 'Monitoring and Evaluation Officer'
                  ? ' Multiple projects may be selected.'
                  : ''}{' '}
                Changes apply when the account is saved.
              </p>
              {projects.length > 0 ? (
                <div className="grid gap-2 rounded-sm border border-border bg-surface-subtle p-3">
                  {projects.map((project) => {
                    const checked = editor.projectIds.includes(project.id)

                    return (
                      <label
                        className="flex cursor-pointer items-start gap-3 rounded-sm p-2 hover:bg-background"
                        key={project.id}
                      >
                        <input
                          aria-label={`Assign ${project.title}`}
                          checked={checked}
                          className="mt-1 h-4 w-4 rounded border-border accent-primary"
                          onChange={(event) =>
                            onChange({
                              ...editor,
                              projectIds: event.target.checked
                                ? [...editor.projectIds, project.id]
                                : editor.projectIds.filter((projectId) => projectId !== project.id),
                            })
                          }
                          type="checkbox"
                        />
                        <span>
                          <span className="block text-sm font-medium text-foreground">
                            {project.title}
                          </span>
                          <span className="block text-xs leading-5 text-muted-foreground">
                            {project.area}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-sm border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
                  No permitted projects are available for this role assignment.
                </p>
              )}
            </fieldset>
          ) : (
            <div className="rounded-sm border border-border bg-surface-subtle p-3 text-sm leading-6 text-muted-foreground">
              {getPathwaysRoleDisplayName(editor.role)} uses its fixed organization or portfolio
              scope and does not receive individual project assignments.
            </div>
          )}
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onSave} type="button">
            {editor.mode === 'create' ? 'Create account' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    ) : null}
  </Dialog>
)

const UserDetailDialog = ({ onClose, user }: { onClose: () => void; user?: UserRecord }) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(user)}>
    {user ? (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account details</DialogTitle>
          <DialogDescription>
            Review account information without opening an editing workflow.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-sm border border-border bg-surface-subtle p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary">
            {getUserInitials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{user.name}</p>
            <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2">
              <StatusBadge tone={userAccountStatusTone(user.accountStatus)}>
                {user.accountStatus}
              </StatusBadge>
            </div>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailItem
            icon={ShieldCheck}
            label="Role"
            value={getPathwaysRoleDisplayName(user.role)}
          />
          <DetailItem icon={KeyRound} label="Sign-in method" value={user.signInMethod} />
          <DetailItem
            icon={Building2}
            label="Access labels"
            value={user.projectAccess.join(', ')}
          />
          <DetailItem
            icon={Clock3}
            label="Last active"
            value={formatAccountDate(user.lastActiveAt)}
          />
        </dl>
        <DialogFooter>
          <Button onClick={onClose} type="button">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    ) : null}
  </Dialog>
)

const DetailItem = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck
  label: string
  value: string
}) => (
  <div className="rounded-sm border border-border bg-surface-subtle p-3">
    <dt className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-2 text-sm font-medium leading-5 text-foreground">{value}</dd>
  </div>
)
