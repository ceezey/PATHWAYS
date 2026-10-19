'use client'

import { Mail, Plus, Search, UserRound, UserX, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import { AsyncState, EmptyState, SectionCard } from '@/components/pathways'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { usersClient } from '@/lib/api/users'
import type { ProjectSummary, UserRecord } from '@/types/pathways'
import {
  type UserStatusFilter,
  canManageUserRecord,
  filterUserRecords,
  getUserAdministrationSummary,
  roleSummaries,
} from '../settings.utils'

import { useUserDirectory } from '../hooks/use-user-directory'
import { useUserEditor } from '../hooks/use-user-editor'
import { AccountMetric } from './account-metric'
import { UserAccountRow } from './user-account-row'
import { UserDetailDialog } from './user-detail-dialog'
import { UserEditorDialog } from './user-editor-dialog'

export const UserManagementWorkspace = ({
  initialProjects = [],
  initialUsers = [],
}: {
  initialProjects?: ProjectSummary[]
  initialUsers?: UserRecord[]
}) => {
  const { labels } = useDisplayLabels()
  const { role: actorRole, profile, assignedProjectIds } = useCurrentRole()
  const { users, setUsers, projects, loadState, setLoadAttempt } = useUserDirectory(
    initialUsers,
    initialProjects,
  )
  const {
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
  } = useUserEditor({
    actorRole,
    profile,
    assignedProjectIds,
    users,
    setUsers,
    projects,
    setLoadAttempt,
  })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('All')
  const [viewUserId, setViewUserId] = useState<string | null>(null)
  const [deactivateUserId, setDeactivateUserId] = useState<string | null>(null)
  const administrationSummary = actorRole
    ? getUserAdministrationSummary(actorRole)
    : 'Verifying account administration access.'

  const filteredUsers = useMemo(
    () => filterUserRecords(users, query, statusFilter),
    [query, statusFilter, users],
  )
  const viewUser = users.find((user) => user.id === viewUserId)
  const deactivateUser = users.find((user) => user.id === deactivateUserId)
  const activeCount = users.filter((user) => user.accountStatus === 'Active').length
  const invitedCount = users.filter((user) => user.accountStatus === 'Invited').length
  const deactivatedCount = users.filter((user) => user.accountStatus === 'Deactivated').length

  const deactivate = async () => {
    if (!deactivateUser) return
    try {
      const updated = await usersClient.updateAuthorizedUser(deactivateUser.id, {
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
      const updated = await usersClient.updateAuthorizedUser(user.id, {
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
          actions={
            canCreateUsers ? (
              <Button className="gap-2" onClick={openCreate} size="sm" type="button">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create user
              </Button>
            ) : null
          }
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
                        {summary.role}
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

          <SectionCard title="Administration links">
            <div className="grid gap-2">
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
        notice={pendingCreate.notice}
        pending={pendingCreate.pending}
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
