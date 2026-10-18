import { Loader2 } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProjectSummary, UserRecord } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import { type UserEditorState, isProjectAssignableRole } from '../settings.utils'

export const UserEditorDialog = ({
  editor,
  error,
  manageableRoles,
  onChange,
  onClose,
  onSave,
  notice,
  pending,
  projects,
}: {
  editor: UserEditorState | null
  error: string
  manageableRoles: PathwaysRole[]
  onChange: (editor: UserEditorState) => void
  onClose: () => void
  onSave: () => void
  notice: string | null
  pending: boolean
  projects: ProjectSummary[]
}) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(editor)}>
    {editor ? (
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editor.mode === 'create' ? 'Create user' : 'Edit user'}</DialogTitle>
          <DialogDescription>
            {editor.mode === 'create'
              ? 'Authorize someone who already has a Supabase Auth account. They must have signed up first; this does not create a new sign-in.'
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
          {editor.mode === 'create' ? (
            <div className="space-y-2">
              <Label htmlFor="user-auth-id">Auth user ID</Label>
              <Input
                id="user-auth-id"
                maxLength={64}
                onChange={(event) => onChange({ ...editor, authUserId: event.target.value })}
                placeholder="00000000-0000-0000-0000-000000000000"
                value={editor.authUserId}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                The Supabase Auth user ID (UUID) for the person's existing account. Find it in the
                Auth directory after they have signed up.
              </p>
            </div>
          ) : (
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
          )}
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
                    {role}
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
                  : ''}
                {editor.role === 'Program Manager'
                  ? ' Optional for Program Managers; managed programs still apply.'
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
              {editor.role} uses its fixed organization or portfolio scope and does not receive
              individual project assignments.
            </div>
          )}
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <output className="block text-sm text-info">{notice}</output> : null}

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={pending} onClick={onSave} type="button">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {pending && editor.mode === 'create'
              ? 'Authorizing...'
              : editor.mode === 'create'
                ? 'Authorize account'
                : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    ) : null}
  </Dialog>
)
