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
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import type { ProjectAssignableRole } from '@/lib/rbac/access-matrix'
import { can } from '@/lib/rbac/can'
import { setPrototypeProjectAssignments } from '@/lib/rbac/data-scope'
import {
  readPrototypeUserRecords,
  writePrototypeUserRecords,
} from '@/lib/rbac/prototype-user-store'
import type { ProjectSummary, UserAccountStatus, UserRecord } from '@/types/pathways'
import { type PrototypeRole, getPrototypeRoleDisplayName } from '@/types/prototype-role'
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
  prototypeRoleSummaries,
  userAccountStatusTone,
} from './user-management-utils'

type EditorMode = 'create' | 'edit'

interface UserEditorState {
  mode: EditorMode
  userId?: string
  name: string
  email: string
  role: PrototypeRole
  signInMethod: UserRecord['signInMethod']
  projectIds: string[]
}

const emptyEditor = (role: PrototypeRole): UserEditorState => ({
  mode: 'create',
  name: '',
  email: '',
  role,
  signInMethod: 'Prototype password',
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
  const { labels } = usePrototypeLabels()
  const { role: actorRole } = usePrototypeRole()
  const [users, setUsers] = useState(initialUsers)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('All')
  const [editor, setEditor] = useState<UserEditorState | null>(null)
  const [viewUserId, setViewUserId] = useState<string | null>(null)
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null)
  const [editorError, setEditorError] = useState('')
  const manageableRoles = useMemo(() => getManageableUserRoles(actorRole), [actorRole])
  const canCreateUsers = manageableRoles.length > 0
  const administrationSummary = getUserAdministrationSummary(actorRole)
  const assignableProjects = useMemo(
    () =>
      editor ? getAssignableProjects(actorRole, editor.role, initialProjects) : initialProjects,
    [actorRole, editor, initialProjects],
  )

  useEffect(() => {
    setUsers(readPrototypeUserRecords(initialUsers))
  }, [initialUsers])

  const filteredUsers = useMemo(
    () => filterUserRecords(users, query, statusFilter),
    [query, statusFilter, users],
  )
  const viewUser = users.find((user) => user.id === viewUserId)
  const deactivateUser = users.find((user) => user.id === deactivateUserId)
  const activeCount = users.filter((user) => user.accountStatus === 'Active').length
  const invitedCount = users.filter((user) => user.accountStatus === 'Invited').length
  const deactivatedCount = users.filter((user) => user.accountStatus === 'Deactivated').length

  const commitUsers = (updater: (current: UserRecord[]) => UserRecord[]) => {
    setUsers((current) => {
      const nextUsers = updater(current)
      writePrototypeUserRecords(nextUsers)
      return nextUsers
    })
  }

  const openCreate = () => {
    const defaultRole = manageableRoles[0]

    if (!defaultRole) {
      return
    }

    setEditor(emptyEditor(defaultRole))
    setEditorError('')
  }

  const openEdit = (user: UserRecord) => {
    if (!canManageUserRecord(actorRole, user)) {
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
      setEditorError('That email already belongs to another prototype user.')
      return
    }

    if (!manageableRoles.includes(editor.role)) {
      setEditorError('That target role is not available to your current prototype role.')
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
    const projectAccess = getProjectAccessLabels(editor.role, projectIds, initialProjects)

    if (editor.mode === 'create') {
      const createdUser: UserRecord = {
        id: `prototype-user-${Date.now()}`,
        name,
        email,
        role: editor.role,
        accountStatus: 'Invited',
        signInMethod: editor.signInMethod,
        projectIds,
        projectAccess,
        createdAt: new Date().toISOString(),
      }
      commitUsers((current) => [createdUser, ...current])
      toast.success('Prototype user created.', {
        description:
          'Saved in this browser for client review. No identity or invitation was created.',
      })
    } else {
      commitUsers((current) =>
        current.map((user) =>
          user.id === editor.userId
            ? {
                ...user,
                name,
                email,
                role: editor.role,
                signInMethod: editor.signInMethod,
                projectIds,
                projectAccess,
              }
            : user,
        ),
      )
      toast.success('Prototype user updated.', {
        description: 'Browser-local changes now inform the selected role preview scope.',
      })
    }

    if (isProjectAssignableRole(editor.role)) {
      setPrototypeProjectAssignments(editor.role as ProjectAssignableRole, projectIds)
    }

    setEditor(null)
    setEditorError('')
  }

  const deactivate = () => {
    if (!deactivateUser) return

    commitUsers((current) =>
      current.map((user) =>
        user.id === deactivateUser.id ? { ...user, accountStatus: 'Deactivated' } : user,
      ),
    )
    setDeactivateUserId(null)
    toast.success('Prototype account deactivated.', {
      description:
        'The browser-local directory changed. No sign-in account or server session changed.',
    })
  }

  const reactivate = (user: UserRecord) => {
    commitUsers((current) =>
      current.map((record) =>
        record.id === user.id ? { ...record, accountStatus: 'Active' } : record,
      ),
    )
    toast.success('Prototype account reactivated.', {
      description: 'This status is saved only in the current browser prototype.',
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
        description="Review prototype users, role assignments, account status, and access-scope labels in one place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="info">Prototype only</StatusBadge>
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
        aria-label="Prototype administration notice"
        className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{administrationSummary}</p>
            <p className="mt-1">
              Prototype configuration only. Changes stay in this browser and do not create
              identities, send invitations, change sign-in access, or enforce server permissions.
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
          description="Search the prototype directory. Actions are available only for roles and projects inside your authority."
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
              <span className="sr-only">Search prototype users</span>
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
              aria-label="Prototype users"
            >
              {filteredUsers.map((user) => (
                <UserAccountRow
                  key={user.id}
                  onDeactivate={() => setDeactivateUserId(user.id)}
                  onEdit={() => openEdit(user)}
                  onReactivate={() => reactivate(user)}
                  onView={() => setViewUserId(user.id)}
                  unavailableReason={
                    canManageUserRecord(actorRole, user)
                      ? undefined
                      : 'Your current prototype role cannot authorize this account or its project scope.'
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
              title="No prototype users match"
            />
          )}
        </SectionCard>

        <aside className="space-y-4" aria-label="Role profiles and administration links">
          <SectionCard
            title="Role profiles"
            description="Plain-language role assignment options shown in the prototype."
          >
            <div className="space-y-3">
              {prototypeRoleSummaries.map((summary) => {
                const count = users.filter((user) => user.role === summary.role).length

                return (
                  <div className="rounded-lg border border-border p-3" key={summary.role}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold leading-5 text-foreground">
                        {getPrototypeRoleDisplayName(summary.role)}
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
              These descriptions support client review only. They do not change real account access.
            </p>
          </SectionCard>

          <SectionCard title="Administration links" description="Related prototype configuration.">
            <div className="grid gap-2">
              {can(actorRole, 'settings.view') ? (
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
              <DialogTitle>Deactivate prototype account?</DialogTitle>
              <DialogDescription>
                {deactivateUser.name} will appear as deactivated on this page. The current session,
                navigation, and any real account remain unchanged.
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
                Deactivate locally
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
          {getPrototypeRoleDisplayName(user.role)} · {user.projectAccess.join(', ')}
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
              Edit prototype user
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.accountStatus === 'Deactivated' ? (
              <DropdownMenuItem onSelect={onReactivate}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reactivate locally
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-destructive" onSelect={onDeactivate}>
                <UserX className="mr-2 h-4 w-4" aria-hidden="true" />
                Deactivate locally
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
  manageableRoles: PrototypeRole[]
  onChange: (editor: UserEditorState) => void
  onClose: () => void
  onSave: () => void
  projects: ProjectSummary[]
}) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(editor)}>
    {editor ? (
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editor.mode === 'create' ? 'Create prototype user' : 'Edit prototype user'}
          </DialogTitle>
          <DialogDescription>
            {editor.mode === 'create'
              ? 'Add an invited account to this page for client review.'
              : 'Update this account record locally for client review.'}{' '}
            Changes stay in this browser; nothing is added to a shared account directory.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="prototype-user-name">Full name</Label>
            <Input
              id="prototype-user-name"
              maxLength={100}
              onChange={(event) => onChange({ ...editor, name: event.target.value })}
              value={editor.name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prototype-user-email">Email</Label>
            <Input
              id="prototype-user-email"
              maxLength={160}
              onChange={(event) => onChange({ ...editor, email: event.target.value })}
              type="email"
              value={editor.email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prototype-user-role">Role</Label>
            <Select
              onValueChange={(value) =>
                onChange({ ...editor, projectIds: [], role: value as PrototypeRole })
              }
              value={editor.role}
            >
              <SelectTrigger id="prototype-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {manageableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {getPrototypeRoleDisplayName(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prototype-user-sign-in">Sign-in method</Label>
            <Select
              onValueChange={(value) =>
                onChange({ ...editor, signInMethod: value as UserRecord['signInMethod'] })
              }
              value={editor.signInMethod}
            >
              <SelectTrigger id="prototype-user-sign-in">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Prototype password">Prototype password</SelectItem>
                <SelectItem value="SSO placeholder">SSO placeholder</SelectItem>
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
                Saving updates the browser-local scoped preview for this role.
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
              {getPrototypeRoleDisplayName(editor.role)} uses its fixed organization or portfolio
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
            {editor.mode === 'create' ? 'Create locally' : 'Save local changes'}
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
          <DialogTitle>Prototype account details</DialogTitle>
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
            value={getPrototypeRoleDisplayName(user.role)}
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
          These are safe sample accounts. Secure sign-in, invitation delivery, and enforced roles
          remain part of production planning.
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
