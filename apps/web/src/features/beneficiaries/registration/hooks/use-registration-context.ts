import {
  beneficiaryRegistrationFieldRules,
  type validateAndNormalizeFormData,
} from '@pathways/shared'
import { useEffect, useState } from 'react'

import { beneficiariesClient } from '@/lib/api/beneficiaries'
import type { SensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import type { BeneficiaryRecord, BeneficiaryRegistrationContext } from '@/types/pathways'

export const useRegistrationContext = ({
  beneficiary,
  selectedProjectId,
  scope,
  setConfirmOpen,
}: {
  beneficiary?: BeneficiaryRecord
  selectedProjectId: string
  scope: SensitiveDraftOwner
  setConfirmOpen: (open: boolean) => void
}) => {
  const [registrationContext, setRegistrationContext] =
    useState<BeneficiaryRegistrationContext | null>(null)
  const [contextState, setContextState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [contextAttempt, setContextAttempt] = useState(0)
  const [selectedFormId, setSelectedFormId] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [definitionErrors, setDefinitionErrors] = useState<
    ReturnType<typeof validateAndNormalizeFormData>['errors']
  >([])
  useEffect(() => {
    if (beneficiary || !selectedProjectId || !scope.isCurrent()) return
    let active = true
    void contextAttempt
    setRegistrationContext(null)
    setSelectedFormId('')
    setCustomValues({})
    setDefinitionErrors([])
    setConfirmOpen(false)
    setContextState('loading')
    void beneficiariesClient
      .getBeneficiaryRegistrationContext(selectedProjectId)
      // Without an eligible published form, provision the fixed system default form once; the
      // server rechecks registration scope and returns the refreshed blank context.
      .then((context) =>
        context.definitions.length === 0 && active && scope.isCurrent()
          ? beneficiariesClient.ensureDefaultRegistrationForm(selectedProjectId)
          : context,
      )
      .then((context) => {
        if (!active || !scope.isCurrent()) return
        setRegistrationContext(context)
        setSelectedFormId(context.definitions.length === 1 ? context.definitions[0].id : '')
        setContextState('ready')
      })
      .catch(() => {
        if (active && scope.isCurrent()) setContextState('error')
      })
    return () => {
      active = false
    }
  }, [beneficiary, selectedProjectId, contextAttempt, scope.isCurrent, setConfirmOpen])
  const registrationForm = registrationContext?.definitions.find(
    (definition) => definition.id === selectedFormId,
  )
  const customFields =
    registrationForm?.fields.filter(
      (field) => !Object.hasOwn(beneficiaryRegistrationFieldRules, field.code),
    ) ?? []
  return {
    registrationContext,
    contextState,
    setContextAttempt,
    selectedFormId,
    setSelectedFormId,
    customValues,
    setCustomValues,
    definitionErrors,
    setDefinitionErrors,
    registrationForm,
    customFields,
  }
}
