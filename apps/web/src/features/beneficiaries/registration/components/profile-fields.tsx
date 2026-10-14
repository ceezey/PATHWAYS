'use client'

import { minimumBeneficiaryAge } from '@pathways/shared'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import type { useRegistrationValidation } from '../hooks/use-registration-validation'
import { type BeneficiaryDraft, type BeneficiaryFieldKey, fieldIds } from '../registration.utils'
import { Field } from './form-field'
import { ToggleField } from './toggle-field'

type Validation = ReturnType<typeof useRegistrationValidation>

export const ProfileFields = ({
  beneficiary,
  projects,
  draft,
  submitted,
  fieldErrors,
  supportsProfileField,
  supportsCode,
  controlA11y,
  updateDraft,
  visibleError,
  onProjectChange,
  maxBirthDate,
  ageFromBirthDate,
  registrationAge,
  ageRuleMessage,
  showsGuardianConsent,
}: Pick<
  Validation,
  | 'fieldErrors'
  | 'supportsProfileField'
  | 'supportsCode'
  | 'maxBirthDate'
  | 'ageFromBirthDate'
  | 'registrationAge'
  | 'ageRuleMessage'
  | 'showsGuardianConsent'
> & {
  beneficiary?: BeneficiaryRecord
  projects: ProjectSummary[]
  draft: BeneficiaryDraft
  submitted: boolean
  controlA11y: (field: BeneficiaryFieldKey) => {
    'aria-describedby': string | undefined
    'aria-invalid': boolean
    id: string
  }
  updateDraft: <Key extends keyof BeneficiaryDraft>(key: Key, value: BeneficiaryDraft[Key]) => void
  visibleError: (field: BeneficiaryFieldKey) => string | undefined
  onProjectChange: (projectId: string) => void
}) => (
  <>
    <div>
      <h2 className="text-lg font-semibold text-foreground">Profile information</h2>
      <p className="text-sm text-muted-foreground">
        Required fields are checked before confirmation.
      </p>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <Field
        error={submitted ? fieldErrors.code : undefined}
        hidden={!supportsProfileField('code')}
        htmlFor={fieldIds.code}
        label="Beneficiary code"
        required
      >
        <Input
          aria-required="true"
          {...controlA11y('code')}
          value={draft.code}
          disabled={Boolean(beneficiary)}
          onChange={(event) => updateDraft('code', event.target.value)}
        />
      </Field>
      <Field
        error={submitted ? fieldErrors.projectId : undefined}
        htmlFor={fieldIds.projectId}
        label="Project enrollment"
        required
      >
        <Select
          value={draft.projectId}
          disabled={Boolean(beneficiary)}
          onValueChange={onProjectChange}
        >
          <SelectTrigger aria-required="true" {...controlA11y('projectId')}>
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        error={submitted ? fieldErrors.firstName : undefined}
        hidden={!supportsProfileField('firstName')}
        htmlFor={fieldIds.firstName}
        label="First name"
        required
      >
        <Input
          aria-required="true"
          {...controlA11y('firstName')}
          value={draft.firstName}
          onChange={(event) => updateDraft('firstName', event.target.value)}
        />
      </Field>
      <Field
        hidden={!supportsCode('middle_name')}
        htmlFor="beneficiary-middle-name"
        label="Middle name"
      >
        <Input
          id="beneficiary-middle-name"
          value={draft.middleName}
          onChange={(event) => updateDraft('middleName', event.target.value)}
        />
      </Field>
      <Field
        error={submitted ? fieldErrors.lastName : undefined}
        hidden={!supportsProfileField('lastName')}
        htmlFor={fieldIds.lastName}
        label="Last name"
        required
      >
        <Input
          aria-required="true"
          {...controlA11y('lastName')}
          value={draft.lastName}
          onChange={(event) => updateDraft('lastName', event.target.value)}
        />
      </Field>
      <Field
        error={submitted ? fieldErrors.sex : undefined}
        hidden={!supportsProfileField('sex')}
        htmlFor={fieldIds.sex}
        label="Sex"
        required
      >
        <Select value={draft.sex} onValueChange={(value) => updateDraft('sex', value)}>
          <SelectTrigger aria-required="true" {...controlA11y('sex')}>
            <SelectValue placeholder="Select sex" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Female">Female</SelectItem>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
            <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
            <SelectItem value="Not specified">Not specified</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field
        error={visibleError('birthDate')}
        hidden={!supportsProfileField('birthDate')}
        htmlFor={fieldIds.birthDate}
        label="Birth date"
      >
        <Input
          {...controlA11y('birthDate')}
          max={maxBirthDate ?? undefined}
          type="date"
          value={draft.birthDate}
          onChange={(event) => updateDraft('birthDate', event.target.value)}
        />
      </Field>
      <Field
        error={visibleError('age')}
        errorId={`${fieldIds.age}-error`}
        hidden={!supportsProfileField('age')}
        htmlFor={fieldIds.age}
        label="Age"
      >
        <Input
          aria-describedby={
            [
              ageFromBirthDate ? `${fieldIds.age}-hint` : '',
              visibleError('age') ? `${fieldIds.age}-error` : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-invalid={Boolean(visibleError('age'))}
          id={fieldIds.age}
          max="130"
          min={minimumBeneficiaryAge}
          readOnly={ageFromBirthDate}
          type="number"
          value={ageFromBirthDate ? (registrationAge?.toString() ?? '') : draft.age}
          onChange={(event) => updateDraft('age', event.target.value)}
        />
        {ageFromBirthDate ? (
          <p className="text-xs text-muted-foreground" id={`${fieldIds.age}-hint`}>
            Calculated from the birth date.
          </p>
        ) : null}
      </Field>
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {ageRuleMessage ?? ''}
      </p>
      <Field
        error={submitted ? fieldErrors.disabilityStatus : undefined}
        hidden={!supportsProfileField('disabilityStatus')}
        htmlFor={fieldIds.disabilityStatus}
        label="Disability status"
        required
      >
        <Select
          value={draft.disabilityStatus}
          onValueChange={(value) => updateDraft('disabilityStatus', value)}
        >
          <SelectTrigger aria-required="true" {...controlA11y('disabilityStatus')}>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="With disability">With disability</SelectItem>
            <SelectItem value="Without disability">Without disability</SelectItem>
            <SelectItem value="Not specified">Not specified</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field
        error={submitted ? fieldErrors.province : undefined}
        hidden={!supportsProfileField('province')}
        htmlFor={fieldIds.province}
        label="Province"
        required
      >
        <Input
          aria-required="true"
          {...controlA11y('province')}
          value={draft.province}
          onChange={(event) => updateDraft('province', event.target.value)}
        />
      </Field>
      <Field
        error={submitted ? fieldErrors.city : undefined}
        hidden={!supportsProfileField('city')}
        htmlFor={fieldIds.city}
        label="City or municipality"
        required
      >
        <Input
          aria-required="true"
          {...controlA11y('city')}
          value={draft.city}
          onChange={(event) => updateDraft('city', event.target.value)}
        />
      </Field>
      <Field
        error={submitted ? fieldErrors.barangay : undefined}
        hidden={!supportsProfileField('barangay')}
        htmlFor={fieldIds.barangay}
        label="Barangay"
        required
      >
        <Input
          aria-required="true"
          {...controlA11y('barangay')}
          value={draft.barangay}
          onChange={(event) => updateDraft('barangay', event.target.value)}
        />
      </Field>
    </div>

    <div className="grid gap-3 rounded-xl border border-border bg-surface-subtle p-4 md:grid-cols-2">
      <ToggleField
        checked={draft.consentToParticipate}
        disabled={Boolean(beneficiary)}
        error={submitted ? fieldErrors.consentToParticipate : undefined}
        hidden={!supportsProfileField('consentToParticipate')}
        id={fieldIds.consentToParticipate}
        label="Beneficiary consent confirmed"
        onChange={(checked) => updateDraft('consentToParticipate', checked)}
        required
      />
      <ToggleField
        checked={draft.consentToStoreData}
        disabled={Boolean(beneficiary)}
        error={submitted ? fieldErrors.consentToStoreData : undefined}
        hidden={!supportsProfileField('consentToStoreData')}
        id={fieldIds.consentToStoreData}
        label="Data storage consent confirmed"
        onChange={(checked) => updateDraft('consentToStoreData', checked)}
        required
      />

      <ToggleField
        checked={draft.guardianConsent}
        disabled={Boolean(beneficiary)}
        error={submitted ? fieldErrors.guardianConsent : undefined}
        hidden={!supportsProfileField('guardianConsent') || !showsGuardianConsent}
        id={fieldIds.guardianConsent}
        label="Guardian consent confirmed"
        onChange={(checked) => updateDraft('guardianConsent', checked)}
        required
      />
      {beneficiary ? (
        <p className="text-sm leading-6 text-muted-foreground md:col-span-2">
          Consent and minor-status provenance are read only in this profile editor. The accepted
          profile update contract does not replace those recorded facts.
        </p>
      ) : null}
    </div>
  </>
)
