'use client'

import { useState } from 'react'

import { useCurrentRole } from '@/hooks/use-current-role'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import type { BeneficiaryRecord, ProjectSummary } from '@/types/pathways'
import { draftFromBeneficiary } from '../registration.utils'
import { BeneficiaryRegistrationForm } from './beneficiary-registration-form'

export const BeneficiaryForm = (props: {
  projects: ProjectSummary[]
  beneficiary?: BeneficiaryRecord
}) => {
  const { profile } = useCurrentRole()
  const [projectId, setProjectId] = useState(
    props.beneficiary ? draftFromBeneficiary(props.beneficiary, props.projects).projectId : '',
  )
  const scope = useSensitiveDraftOwner(
    profile,
    'beneficiary',
    props.beneficiary ? 'beneficiaries.profiles.update' : 'beneficiaries.records.register',
    projectId || null,
    props.beneficiary?.id ?? null,
  )
  if (!scope) return <output>Current beneficiary access is required.</output>
  return (
    <BeneficiaryRegistrationForm
      key={scope.key + scope.generation}
      {...props}
      scope={scope}
      selectedProjectId={projectId}
      onProjectChange={setProjectId}
    />
  )
}
