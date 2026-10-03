'use client'

import { ChevronDown, Loader2, RefreshCw, X } from 'lucide-react'
import type { Control } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UserRecord } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

import {
  type CanonicalRole,
  canAssignRole,
} from '../../../../api/src/modules/auth/authorization-policy'

import type { ProjectSetupSchema } from './project-form-validation'

export type TeamFieldName =
  | 'programManager'
  | 'projectManager'
  | 'monitoringOfficer'
  | 'projectOfficers'

const teamRoles: Record<TeamFieldName, PathwaysRole> = {
  programManager: 'Program Manager',
  projectManager: 'Project Manager',
  monitoringOfficer: 'Monitoring and Evaluation Officer',
  projectOfficers: 'Project Officer',
}

const roleLabels: Record<PathwaysRole, string> = {
  'Program Manager': 'Program Manager',
  'Grant Manager': 'Grant Manager',
  'Project Manager': 'Project Manager',
  'Monitoring and Evaluation Officer': 'Monitoring and Evaluation Officer',
  'Project Officer': 'Project Officer',
  'System Administrator': 'System Administrator',
}

const hideableTargets: Record<TeamFieldName, CanonicalRole | null> = {
  programManager: null,
  projectManager: 'PROJECT_MANAGER',
  monitoringOfficer: 'MONITORING_AND_EVALUATION_OFFICER',
  projectOfficers: 'PROJECT_OFFICER',
}

/** Program and Project Managers only see the team fields they may assign; other roles see all. */
export const hiddenTeamFields = (actorRole: string | undefined): TeamFieldName[] => {
  if (actorRole !== 'PROJECT_MANAGER' && actorRole !== 'PROGRAM_MANAGER') return []
  return (Object.keys(hideableTargets) as TeamFieldName[]).filter((field) => {
    const target = hideableTargets[field]
    return !target || !canAssignRole(actorRole, target)
  })
}

export const getEligibleTeamUsers = (users: UserRecord[], role: PathwaysRole) =>
  users.filter((user) => user.role === role && user.accountStatus === 'Active')

export const parseProjectOfficerNames = (value: string) =>
  value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

export const validateProjectTeamSelections = (
  values: Pick<ProjectSetupSchema, TeamFieldName>,
  users: UserRecord[],
) => {
  const errors: Partial<Record<TeamFieldName, string>> = {}
  // A blank single-assignment field means "None" (an intentional, always
  // allowed clear) rather than an unresolved selection, so it must never be
  // treated as a name to validate against the eligible set. Filtering it
  // out here keeps a blank field from being flagged as an invalid legacy
  // value whenever the role happens to have at least one eligible user.
  const selectedByField: Record<TeamFieldName, string[]> = {
    programManager: values.programManager ? [values.programManager] : [],
    projectManager: values.projectManager ? [values.projectManager] : [],
    monitoringOfficer: values.monitoringOfficer ? [values.monitoringOfficer] : [],
    projectOfficers: parseProjectOfficerNames(values.projectOfficers),
  }

  for (const fieldName of Object.keys(teamRoles) as TeamFieldName[]) {
    const role = teamRoles[fieldName]
    const eligibleNames = new Set(getEligibleTeamUsers(users, role).map((user) => user.name))
    const selectedNames = selectedByField[fieldName]

    if (
      eligibleNames.size > 0 &&
      selectedNames.length > 0 &&
      selectedNames.some((name) => !eligibleNames.has(name))
    ) {
      errors[fieldName] =
        fieldName === 'projectOfficers'
          ? 'Select at least one active Project Officer from the list.'
          : `Select an active ${roleLabels[role]} from the list.`
    }
  }

  return errors
}

const optionPlaceholder = (
  role: PathwaysRole,
  loading: boolean,
  loadError: string | null,
  optionCount: number,
) => {
  if (loading) {
    return `Loading ${roleLabels[role]} options...`
  }

  if (loadError) {
    return 'Team directory unavailable'
  }

  if (optionCount === 0) {
    return `No active ${roleLabels[role]} available`
  }

  return `Select ${roleLabels[role]}`
}

const noneOptionValue = '__none__'

const SingleTeamSelector = ({
  allowClear = true,
  control,
  disabled,
  fieldName,
  label,
  loadError,
  loading,
  unavailableMessage,
  users,
}: {
  allowClear?: boolean
  control: Control<ProjectSetupSchema>
  disabled: boolean
  fieldName: Exclude<TeamFieldName, 'projectOfficers'>
  label: string
  loadError: string | null
  loading: boolean
  unavailableMessage?: string
  users: UserRecord[]
}) => {
  const role = teamRoles[fieldName]
  const options = getEligibleTeamUsers(users, role)

  return (
    <FormField
      control={control}
      name={fieldName}
      render={({ field }) => {
        const selectedUser = options.find((user) => user.name === field.value)

        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select
              disabled={disabled || Boolean(unavailableMessage) || options.length === 0}
              onValueChange={(userId) => {
                // Radix Select mirrors its controlled value onto a visually
                // hidden native <select> for form participation. When that
                // native element's options change (e.g. this component's
                // eligible-user list populates asynchronously after
                // getUsers() resolves) while the dropdown has never been
                // opened, the browser cannot yet find a matching <option>
                // for the id we set, silently resets the native element's
                // value to "", and Radix bubbles that back through
                // onValueChange(''). No real SelectItem ever carries the
                // value "" (Radix throws on an empty item value, and the
                // "None" item uses noneOptionValue instead), so an
                // onValueChange('') call is never a genuine user choice.
                // Ignoring it here is what keeps an already-assigned,
                // still-eligible user from being wiped out purely because
                // the option list loaded after mount.
                if (userId === '') {
                  return
                }
                if (userId === noneOptionValue) {
                  field.onChange('')
                  return
                }
                const user = options.find((option) => option.id === userId)
                field.onChange(user?.name ?? '')
              }}
              value={selectedUser?.id ?? ''}
            >
              <FormControl>
                <SelectTrigger
                  className="min-w-0 overflow-hidden"
                  onBlur={field.onBlur}
                  ref={field.ref}
                >
                  <SelectValue
                    placeholder={
                      unavailableMessage
                        ? 'Assignment unavailable'
                        : optionPlaceholder(role, loading, loadError, options.length)
                    }
                  >
                    {selectedUser || field.value ? (
                      <span className="block min-w-0 truncate pr-2 font-medium">
                        {selectedUser?.name ?? field.value}
                      </span>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent className="max-w-[calc(100vw-2rem)] sm:min-w-[var(--radix-select-trigger-width)]">
                {allowClear ? (
                  <SelectItem value={noneOptionValue}>
                    <span className="text-muted-foreground">None</span>
                  </SelectItem>
                ) : null}
                {options.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <span className="flex min-w-0 max-w-full flex-col overflow-hidden">
                      <span className="truncate font-medium">{user.name}</span>
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        title={user.email}
                      >
                        {user.email}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unavailableMessage ? (
              <FormDescription>{unavailableMessage}</FormDescription>
            ) : !loading && !loadError && options.length === 0 ? (
              <FormDescription>
                {field.value
                  ? 'The current assignment remains unchanged.'
                  : `No active ${roleLabels[role]} account is available.`}
              </FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

export const ProjectTeamSelectors = ({
  control,
  disallowAssignRoles,
  disallowClearRoles,
  hiddenFields = [],
  loadError,
  loading,
  onRetry,
  unavailableMessage,
  users,
}: {
  hiddenFields?: TeamFieldName[]
  control: Control<ProjectSetupSchema>
  // Fields the signed-in actor is not authorized to assign (mirrors
  // canAssignRole server-side): the selector and its None option are
  // disabled rather than hidden, so the current assignment stays visible.
  disallowAssignRoles?: TeamFieldName[]
  disallowClearRoles?: Exclude<TeamFieldName, 'projectOfficers'>[]
  loadError: string | null
  loading: boolean
  onRetry: () => void
  unavailableMessage?: string
  users: UserRecord[]
}) => {
  const officerOptions = getEligibleTeamUsers(users, 'Project Officer')
  const disabled = loading || Boolean(loadError)
  const canClear = (fieldName: Exclude<TeamFieldName, 'projectOfficers'>) =>
    !disallowClearRoles?.includes(fieldName)
  const canAssignField = (fieldName: TeamFieldName) => !disallowAssignRoles?.includes(fieldName)

  return (
    <div className="space-y-5">
      {loading ? (
        <output className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading active team members...
        </output>
      ) : null}
      {loadError ? (
        <div
          className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-danger">{loadError}</p>
          <Button className="gap-2" onClick={onRetry} size="sm" type="button" variant="outline">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry team directory
          </Button>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {hiddenFields.includes('programManager') ? null : (
          <SingleTeamSelector
            allowClear={canClear('programManager')}
            control={control}
            disabled={disabled || !canAssignField('programManager')}
            fieldName="programManager"
            label="Program Manager"
            loadError={loadError}
            loading={loading}
            unavailableMessage={unavailableMessage}
            users={users}
          />
        )}
        {hiddenFields.includes('projectManager') ? null : (
          <SingleTeamSelector
            allowClear={canClear('projectManager')}
            control={control}
            disabled={disabled || !canAssignField('projectManager')}
            fieldName="projectManager"
            label="Project Manager"
            loadError={loadError}
            loading={loading}
            unavailableMessage={unavailableMessage}
            users={users}
          />
        )}
        {hiddenFields.includes('monitoringOfficer') ? null : (
          <SingleTeamSelector
            allowClear={canClear('monitoringOfficer')}
            control={control}
            disabled={disabled || !canAssignField('monitoringOfficer')}
            fieldName="monitoringOfficer"
            label="Monitoring and Evaluation Officer"
            loadError={loadError}
            loading={loading}
            unavailableMessage={unavailableMessage}
            users={users}
          />
        )}
        {hiddenFields.includes('projectOfficers') ? null : (
          <FormField
            control={control}
            name="projectOfficers"
            render={({ field }) => {
              const selectedNames = parseProjectOfficerNames(field.value)
              const eligibleNames = new Set(officerOptions.map((user) => user.name))
              const placeholder = optionPlaceholder(
                'Project Officer',
                loading,
                loadError,
                officerOptions.length,
              )

              const updateSelectedNames = (names: string[]) => field.onChange(names.join(', '))

              return (
                <FormItem>
                  <FormLabel>Project Officers</FormLabel>
                  <DropdownMenu>
                    <FormControl>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="w-full justify-between gap-3 font-normal"
                          disabled={
                            disabled ||
                            Boolean(unavailableMessage) ||
                            officerOptions.length === 0 ||
                            !canAssignField('projectOfficers')
                          }
                          onBlur={field.onBlur}
                          ref={field.ref}
                          type="button"
                          variant="outline"
                        >
                          <span className="truncate">
                            {unavailableMessage
                              ? 'Assignment unavailable'
                              : selectedNames.length > 0
                                ? `${selectedNames.length} Project Officer${selectedNames.length === 1 ? '' : 's'} selected`
                                : placeholder}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                    </FormControl>
                    <DropdownMenuContent
                      align="start"
                      className="w-[var(--radix-dropdown-menu-trigger-width)]"
                    >
                      {officerOptions.map((user) => (
                        <DropdownMenuCheckboxItem
                          checked={selectedNames.includes(user.name)}
                          key={user.id}
                          onCheckedChange={(checked) => {
                            updateSelectedNames(
                              checked
                                ? [...selectedNames, user.name]
                                : selectedNames.filter((name) => name !== user.name),
                            )
                          }}
                          onSelect={(event) => event.preventDefault()}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium">{user.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {unavailableMessage ? (
                    <FormDescription>{unavailableMessage}</FormDescription>
                  ) : !loading && !loadError && officerOptions.length === 0 ? (
                    <FormDescription>
                      No active Project Officer account is available.
                    </FormDescription>
                  ) : (
                    <FormDescription>Select one or more active Project Officers.</FormDescription>
                  )}
                  {selectedNames.length > 0 ? (
                    <ul aria-label="Selected Project Officers" className="space-y-2">
                      {selectedNames.map((name) => (
                        <li
                          className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
                          key={name}
                        >
                          <span className="min-w-0">
                            <span className="block break-words font-medium text-foreground">
                              {name}
                            </span>
                            {!eligibleNames.has(name) ? (
                              <span className="block text-xs text-danger">
                                Unavailable account or role. Remove and select again.
                              </span>
                            ) : null}
                          </span>
                          <Button
                            aria-label={`Remove ${name}`}
                            className="h-11 w-11 shrink-0"
                            onClick={() =>
                              updateSelectedNames(
                                selectedNames.filter((selectedName) => selectedName !== name),
                              )
                            }
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
