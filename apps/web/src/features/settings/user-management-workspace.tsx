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
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import type { UserAccountStatus, UserRecord } from '@/types/pathways'
import {
  type PrototypeRole,
  getPrototypeRoleDisplayName,
  prototypeRoles,
} from '@/types/prototype-role'
import {
  type UserStatusFilter,
  filterUserRecords,
  getUserInitials,
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
  projectAccess: string
}

const emptyEditor = (): UserEditorState => ({
  mode: 'create',
  name: '',
  email: '',
  role: 'Project Officer',
  signInMethod: 'Prototype password',
  projectAccess: '',
})

const formatAccountDate = (value?: string) => {
  if (!value) return 'Not yet active'

  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

export const UserManagementWorkspace = ({ initialUsers }: { initialUsers: UserRecord[] }) => {
  const { labels } = usePrototypeLabels()
  const [users, setUsers] = useState(initialUsers)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('All')
  const [editor, setEditor] = useState<UserEditorState | null>(null)
  const [viewUserId, setViewUserId] = useState<string | null>(null)
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null)
  const [editorError, setEditorError] = useState('')

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
    setEditor(emptyEditor())
    setEditorError('')
  }

  const openEdit = (user: UserRecord) => {
    setEditor({
      mode: 'edit',
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      signInMethod: user.signInMethod,
      projectAccess: user.projectAccess.join(', '),
    })
    setEditorError('')
  }

  const saveEditor = () => {
    if (!editor) return

    const name = editor.name.trim()
    const email = editor.email.trim().toLocaleLowerCase()
    const projectAccess = editor.projectAccess
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

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

    if (projectAccess.length === 0) {
      setEditorError('Add at least one project or access-scope label.')
      return
    }

    if (editor.mode === 'create') {
      const createdUser: UserRecord = {
        id: `prototype-user-${Date.now()}`,
        name,
        email,
        role: editor.role,
        accountStatus: 'Invited',
        signInMethod: editor.signInMethod,
        projectAccess,
        createdAt: new Date().toISOString(),
      }
      setUsers((current) => [createdUser, ...current])
      toast.success('Prototype user created.', {
        description:
          'The invited account exists only until this page reloads. No invitation was sent.',
      })
    } else {
      setUsers((current) =>
        current.map((user) =>
          user.id === editor.userId
            ? {
                ...user,
                name,
                email,
                role: editor.role,
                signInMethod: editor.signInMethod,
                projectAccess,
              }
            : user,
        ),
      )
      toast.success('Prototype user updated.', {
        description: 'Changes affect this page only and reset when it reloads.',
      })
    }

    setEditor(null)
    setEditorError('')
  }

  const deactivate = () => {
    if (!deactivateUser) return

    setUsers((current) =>
      current.map((user) =>
        user.id === deactivateUser.id ? { ...user, accountStatus: 'Deactivated' } : user,
      ),
    )
    setDeactivateUserId(null)
    toast.success('Prototype account deactivated.', {
      description:
        'The current session and navigation remain available. No sign-in account changed.',
    })
  }

  const reactivate = (user: UserRecord) => {
    setUsers((current) =>
      current.map((record) =>
        record.id === user.id ? { ...record, accountStatus: 'Active' } : record,
      ),
    )
    toast.success('Prototype account reactivated.', {
      description: 'This status change resets when the page reloads.',
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
            <Button className="gap-2" onClick={openCreate} size="sm" type="button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create user
            </Button>
          </div>
        }
      />

      <section
        aria-label="Prototype administration notice"
        className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm leading-6 text-info"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Prototype configuration only. Account actions affect this page only and do not create
            identities, send invitations, change sign-in access, or enforce roles.
          </p>
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
          description="Search the prototype directory and open account actions when needed."
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
              <Button asChild className="justify-start" variant="outline">
                <Link href="/settings/labels">Edit Labels</Link>
              </Button>
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
        onChange={(next) => {
          setEditor(next)
          setEditorError('')
        }}
        onClose={() => {
          setEditor(null)
          setEditorError('')
        }}
        onSave={saveEditor}
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
  user,
}: {
  onDeactivate: () => void
  onEdit: () => void
  onReactivate: () => void
  onView: () => void
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
    </div>
  </li>
)

const UserEditorDialog = ({
  editor,
  error,
  onChange,
  onClose,
  onSave,
}: {
  editor: UserEditorState | null
  error: string
  onChange: (editor: UserEditorState) => void
  onClose: () => void
  onSave: () => void
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
            Nothing is added to a shared account directory.
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
              onValueChange={(value) => onChange({ ...editor, role: value as PrototypeRole })}
              value={editor.role}
            >
              <SelectTrigger id="prototype-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {prototypeRoles.map((role) => (
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
          <div className="space-y-2">
            <Label htmlFor="prototype-user-access">Project or access-scope labels</Label>
            <Input
              id="prototype-user-access"
              maxLength={240}
              onChange={(event) => onChange({ ...editor, projectAccess: event.target.value })}
              placeholder="FutureMakers NCR, Assigned projects"
              value={editor.projectAccess}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Separate labels with commas. These labels do not grant sign-in access.
            </p>
          </div>
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
