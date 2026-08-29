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
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

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
import { can } from '@/lib/rbac/can'
import type { ProjectSummary, UserAccountStatus, UserRecord } from '@/types/pathways'
import { type PathwaysRole, getPathwaysRoleDisplayName } from '@/types/pathways-role'
import {
  type UserStatusFilter,
  canManageUserRecord,
  filterUserRecords,
  getAssignableProjects,
  getManageableUserRoles,
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
  signInMethod: 'Password',
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
  initialProjects,
  initialUsers,
}: {
  initialProjects: ProjectSummary[]
  initialUsers: UserRecord[]
}) => {
  const { labels } = useDisplayLabels()
  const { assignedProjectIds, role: actorRole } = useCurrentRole()
  const users = initialUsers
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
  const canCreateUsers = manageableRoles.length > 0
  const administrationSummary = actorRole
    ? getUserAdministrationSummary(actorRole)
    : 'A recognized authenticated role is required before account administration is available.'
  const assignableProjects = useMemo(
    () =>
      editor && actorRole
        ? getAssignableProjects(actorRole, editor.role, initialProjects, assignedProjectIds)
        : initialProjects,
    [actorRole, assignedProjectIds, editor, initialProjects],
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
    if (!actorRole || !canManageUserRecord(actorRole, user, assignedProjectIds)) {
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

  const saveEditor = () => {
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
      setEditorError('That target role is not available to your authenticated role.')
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

    const projectIds = isProjectAssignableRole(editor.role) ? selectedProjectIds : []
    setEditorError('User administration backend is not configured. This draft has not been saved.')
    toast.error('User changes were not saved.', {
      description: 'Connect the user administration backend before enabling this action.',
    })
  }

  const deactivate = () => {
    if (!deactivateUser) return

    setDeactivateUserId(null)
    toast.error('Account status was not changed.', {
      description: 'User administration backend is not configured.',
    })
  }

  const reactivate = (user: UserRecord) => {
    void user
    toast.error('Account status was not changed.', {
      description: 'User administration backend is not configured.',
    })
  }

  const clearFilters = () => {
    setQuery('')
    setStatusFilter('All')
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title={labels.moduleUserManagement}
        description="Review user records, role assignments, account status, and access-scope labels in one place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="warning">Backend not configured</StatusBadge>
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
        aria-label="User administration integration notice"
        className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{administrationSummary}</p>
            <p className="mt-1">
              User administration writes are disabled until the backend integration can create
              identities, send invitations, and enforce role and project assignments.
            </p>
          </div>
        </div>
      </section>

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
          description="Search the user directory. Actions are available only for roles and projects inside your authority."
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
              aria-label="Users"
            >
              {filteredUsers.map((user) => (
                <UserAccountRow
                  key={user.id}
                  onDeactivate={() => setDeactivateUserId(user.id)}
                  onEdit={() => openEdit(user)}
                  onReactivate={() => reactivate(user)}
                  onView={() => setViewUserId(user.id)}
                  unavailableReason={
                    actorRole && canManageUserRecord(actorRole, user, assignedProjectIds)
                      ? undefined
                      : 'Your authenticated role cannot authorize this account or its project scope.'
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
              description="No user records were returned. The user administration backend may not be configured yet."
              icon={Search}
              title="No users available"
            />
          )}
        </SectionCard>

        <aside className="space-y-4" aria-label="Role profiles and administration links">
          <SectionCard
            title="Role profiles"
            description="Plain-language role assignment options for the account workflow."
          >
            <div className="space-y-3">
              {roleSummaries.map((summary) => {
                const count = users.filter((user) => user.role === summary.role).length

                return (
                  <div className="rounded-lg border border-border p-3" key={summary.role}>
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
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              These descriptions are frontend guidance only. Server authorization remains
              authoritative.
            </p>
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
                This action requires the user administration backend. No account will be changed
                while the integration is unavailable.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-warning">
              No sign-in account or access rule will be changed.
            </div>
            <DialogFooter>
              <Button onClick={() => setDeactivateUserId(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button onClick={deactivate} type="button" variant="destructive">
                Request deactivation
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
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
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
            {user.accountStatus === 'Deactivated' ? (
              <DropdownMenuItem onSelect={onReactivate}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reactivate account
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
            Prepare the account and access fields. Submission remains disabled until the user
            administration backend is connected.
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
                <SelectItem value="Password">Password</SelectItem>
                <SelectItem value="Single sign-on">Single sign-on</SelectItem>
                <SelectItem value="Magic link">Magic link</SelectItem>
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
                Assignments are submitted only after the backend integration is configured.
              </p>
              {projects.length > 0 ? (
                <div className="grid gap-2 rounded-lg border border-border p-3">
                  {projects.map((project) => {
                    const checked = editor.projectIds.includes(project.id)

                    return (
                      <label
                        className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/60"
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
                <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  No permitted projects are available for this role assignment.
                </p>
              )}
            </fieldset>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
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
            {editor.mode === 'create' ? 'Create user' : 'Save changes'}
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
        <div className="flex items-start gap-3 rounded-lg border border-border p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
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
        <p className="text-xs leading-5 text-muted-foreground">
          Account records are read-only until user administration endpoints are configured.
        </p>
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
  <div className="rounded-lg border border-border p-3">
    <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </dt>
    <dd className="mt-2 text-sm font-medium leading-5 text-foreground">{value}</dd>
  </div>
)
