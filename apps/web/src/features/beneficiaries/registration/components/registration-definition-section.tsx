'use client'

import { FormDefinitionEntryField } from '@/features/collection'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { useRegistrationContext } from '../hooks/use-registration-context'

type Context = ReturnType<typeof useRegistrationContext>

export const RegistrationDefinitionSection = ({
  contextState,
  setContextAttempt,
  registrationContext,
  selectedFormId,
  setSelectedFormId,
  setCustomValues,
  setDefinitionErrors,
  registrationForm,
  customFields,
  customValues,
  definitionErrors,
  saving,
  setConfirmOpen,
  individualSupportIssue,
}: Pick<
  Context,
  | 'contextState'
  | 'setContextAttempt'
  | 'registrationContext'
  | 'selectedFormId'
  | 'setSelectedFormId'
  | 'setCustomValues'
  | 'setDefinitionErrors'
  | 'registrationForm'
  | 'customFields'
  | 'customValues'
  | 'definitionErrors'
> & {
  saving: boolean
  setConfirmOpen: (open: boolean) => void
  individualSupportIssue: string | null
}) => (
  <section aria-label="Registration form" className="space-y-3">
    {contextState === 'loading' ? <output>Loading registration forms.</output> : null}
    {contextState === 'error' ? (
      <div role="alert">
        Registration forms could not be loaded.
        <Button
          type="button"
          variant="outline"
          onClick={() => setContextAttempt((attempt) => attempt + 1)}
        >
          Retry registration forms
        </Button>
      </div>
    ) : null}
    {contextState === 'ready' && registrationContext?.definitions.length === 0 ? (
      <p role="alert">
        No registration form is available for this project. Ask a form manager to publish one.
      </p>
    ) : null}
    {contextState === 'ready' &&
    registrationContext &&
    registrationContext.definitions.length > 1 ? (
      <>
        <Label htmlFor="registration-definition">Published registration form</Label>
        <Select
          value={selectedFormId || 'unselected'}
          disabled={saving}
          onValueChange={(id) => {
            setSelectedFormId(id === 'unselected' ? '' : id)
            setCustomValues({})
            setDefinitionErrors([])
            setConfirmOpen(false)
          }}
        >
          <SelectTrigger id="registration-definition" aria-required="true">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unselected">Choose a form</SelectItem>
            {registrationContext.definitions.map((definition) => (
              <SelectItem key={definition.id} value={definition.id}>
                {definition.name} ({definition.code}, version {definition.version})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </>
    ) : null}
    {registrationForm ? (
      <p>
        {registrationForm.name}, version {registrationForm.version}
      </p>
    ) : null}
    {registrationForm ? (
      <p className="text-sm text-muted-foreground">
        Only fields supported by this selected definition are submitted. Unsupported profile draft
        fields are not sent.
      </p>
    ) : null}
    {individualSupportIssue ? <p role="alert">{individualSupportIssue}</p> : null}
    {customFields.map((field) => (
      <FormDefinitionEntryField
        key={field.id ?? field.code}
        field={field}
        disabled={saving}
        value={customValues[field.code]}
        errors={definitionErrors
          .filter((error) => error.fieldCode === field.code)
          .map((error) => error.message)}
        onChange={(value) => {
          setConfirmOpen(false)
          setCustomValues((current) => ({ ...current, [field.code]: value }))
        }}
      />
    ))}
    {definitionErrors.length ? (
      <ul role="alert" aria-label="Registration validation errors">
        {definitionErrors.map((error) => (
          <li key={[error.fieldCode, error.code, error.message].join(':')}>{error.message}</li>
        ))}
      </ul>
    ) : null}
  </section>
)
