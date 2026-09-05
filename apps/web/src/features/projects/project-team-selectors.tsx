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
import type { PrototypeRole } from '@/types/prototype-role'

import type { ProjectSetupSchema } from './project-form-validation'

type TeamFieldName = 'programManager' | 'projectManager' | 'monitoringOfficer' | 'projectOfficers'

const teamRoles: Record<TeamFieldName, PrototypeRole> = {
  programManager: 'Program Manager',
  projectManager: 'Project Manager',
  monitoringOfficer: 'Monitoring and Evaluation Officer',
  projectOfficers: 'Project Officer',
}

const roleLabels: Record<PrototypeRole, string> = {
  'Program Manager': 'Program Manager',
  'Grant Manager': 'Grant Manager',
  'Project Manager': 'Project Manager',
  'Monitoring and Evaluation Officer': 'Monitoring and Evaluation Officer',
  'Project Officer': 'Project Officer',
  'System Administrator': 'System Administrator',
}

export const getEligibleTeamUsers = (users: UserRecord[], role: PrototypeRole) =>
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
  const selectedByField: Record<TeamFieldName, string[]> = {
    programManager: [values.programManager],
    projectManager: [values.projectManager],
    monitoringOfficer: [values.monitoringOfficer],
    projectOfficers: parseProjectOfficerNames(values.projectOfficers),
  }

  for (const fieldName of Object.keys(teamRoles) as TeamFieldName[]) {
    const role = teamRoles[fieldName]
    const eligibleNames = new Set(getEligibleTeamUsers(users, role).map((user) => user.name))
    const selectedNames = selectedByField[fieldName]

    if (selectedNames.length === 0 || selectedNames.some((name) => !eligibleNames.has(name))) {
      errors[fieldName] =
        fieldName === 'projectOfficers'
          ? 'Select at least one active Project Officer from the list.'
          : `Select an active ${roleLabels[role]} from the list.`
    }
  }

  return errors
}

const optionPlaceholder = (
  role: PrototypeRole,
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

const SingleTeamSelector = ({
  control,
  disabled,
  fieldName,
  label,
  loadError,
  loading,
  users,
}: {
  control: Control<ProjectSetupSchema>
  disabled: boolean
  fieldName: Exclude<TeamFieldName, 'projectOfficers'>
  label: string
  loadError: string | null
  loading: boolean
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
            <FormLabel required>{label}</FormLabel>
            <Select
              disabled={disabled || options.length === 0}
              onValueChange={(userId) => {
                const user = options.find((option) => option.id === userId)
                field.onChange(user?.name ?? '')
              }}
              value={selectedUser?.id ?? ''}
            >
              <FormControl aria-required="true">
                <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                  <SelectValue
                    placeholder={optionPlaceholder(role, loading, loadError, options.length)}
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {options.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loading && !loadError && options.length === 0 ? (
              <FormDescription>No active {roleLabels[role]} account is available.</FormDescription>
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
  loadError,
  loading,
  onRetry,
  users,
}: {
  control: Control<ProjectSetupSchema>
  loadError: string | null
  loading: boolean
  onRetry: () => void
  users: UserRecord[]
}) => {
  const officerOptions = getEligibleTeamUsers(users, 'Project Officer')
  const disabled = loading || Boolean(loadError)

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
          className="flex flex-col gap-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
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
        <SingleTeamSelector
          control={control}
          disabled={disabled}
          fieldName="programManager"
          label="Program Manager"
          loadError={loadError}
          loading={loading}
          users={users}
        />
        <SingleTeamSelector
          control={control}
          disabled={disabled}
          fieldName="projectManager"
          label="Project Manager"
          loadError={loadError}
          loading={loading}
          users={users}
        />
        <SingleTeamSelector
          control={control}
          disabled={disabled}
          fieldName="monitoringOfficer"
          label="Monitoring and Evaluation Officer"
          loadError={loadError}
          loading={loading}
          users={users}
        />
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
                <FormLabel required>Project Officers</FormLabel>
                <DropdownMenu>
                  <FormControl aria-required="true">
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="w-full justify-between gap-3 font-normal"
                        disabled={disabled || officerOptions.length === 0}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        type="button"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedNames.length > 0
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
                {!loading && !loadError && officerOptions.length === 0 ? (
                  <FormDescription>No active Project Officer account is available.</FormDescription>
                ) : (
                  <FormDescription>Select one or more active Project Officers.</FormDescription>
                )}
                {selectedNames.length > 0 ? (
                  <ul aria-label="Selected Project Officers" className="space-y-2">
                    {selectedNames.map((name) => (
                      <li
                        className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
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
                          className="h-10 w-10 shrink-0"
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
      </div>
    </div>
  )
}
