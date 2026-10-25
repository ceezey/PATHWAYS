import { toast } from 'sonner'

import { downloadCoreArtifact } from '@/lib/api/core/artifact-download'
import { formsClient } from '@/lib/api/forms'
import { fingerprintOf } from '@/lib/forms/pending-create'

import type { SavedForm } from '../../collection.utils'
import { fromDigitalForm, neatFormCode, toDigitalFormInput } from '../digital-form-contract'
import { formDefinitionExportRequest } from '../form-definition-export'
import { type ExportFormat, toApiFormType } from '../forms.utils'
import type { CollectionGuard } from './use-collection-guard'
import type { CollectionState } from './use-collection-state'

export function useFormActions(state: CollectionState, guard: CollectionGuard) {
  const {
    creatingVersion,
    editingBaseUpdatedAt,
    editingFormId,
    fields,
    formCode,
    formCreate,
    formDescription,
    formTitle,
    formType,
    forms,
    indicatorIds,
    journeyStage,
    linkedActivityId,
    projectId,
    setCreatingVersion,
    setEditingBaseUpdatedAt,
    setEditingFormId,
    setFields,
    setFormCode,
    setFormDescription,
    setFormTitle,
    setFormType,
    setForms,
    setHydratedFormId,
    setJourneyStage,
    setLinkedActivityId,
    setSaveDialogOpen,
    setSavedNotice,
    setSelectedFieldId,
    setView,
  } = state
  const { beginOperation, canManageForms, canPublishForms, editingReady } = guard
  // Format selection is hidden (vault note deferred-features); exports use the default.
  const exportFormat: ExportFormat = 'csv'
  const saveDraftToApi = async () => {
    if (!editingReady) {
      toast.error('The saved form must finish loading before it can be edited.')
      return
    }
    if (!canManageForms) {
      toast.error('Form management is not available for this role.')
      return
    }
    if (!projectId) {
      toast.error('Select an authorized project.')
      return
    }
    if (indicatorIds.length) {
      toast.error(
        'Indicator links cannot be saved by the current form API. Clear them before saving.',
      )
      return
    }
    // Generated once per new draft so a retried create reuses the same code.
    const code = formCode || neatFormCode(formTitle)
    if (!formCode) setFormCode(code)
    const input = toDigitalFormInput({
      code,
      name: formTitle.trim(),
      description: formDescription,
      formType: toApiFormType(formType),
      activityId: linkedActivityId || undefined,
      journeyStageId: journeyStage || undefined,
      fields,
    })
    const ticket = beginOperation('forms.manage')
    if (!ticket) return
    try {
      const existing = forms.find((form) => form.id === editingFormId)
      if (existing?.status === 'PUBLISHED') {
        toast.error('Published form fields are read-only. Create a new version before editing.')
        return
      }
      const saved = existing
        ? await formsClient.updateDigitalForm(projectId, existing.id, {
            ...input,
            expectedUpdatedAt: editingBaseUpdatedAt ?? existing.updatedAt,
          })
        : await formCreate.submit(fingerprintOf(input.code), () =>
            formsClient.createDigitalForm(projectId, input),
          )
      if (!saved || !ticket.valid()) return
      setForms((current) => [...current.filter((form) => form.id !== saved.id), saved])
      setEditingFormId(saved.id)
      setHydratedFormId(saved.id)
      setEditingBaseUpdatedAt(saved.updatedAt)
      setFormCode(saved.code)
      setSaveDialogOpen(false)
      setSavedNotice('Draft saved to the server.')
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'Form draft could not be saved.')
    } finally {
      ticket.finish()
    }
  }
  const publishFormToApi = async () => {
    if (!canPublishForms) {
      toast.error('Form publishing is not available for this role.')
      return
    }
    const existing = forms.find((form) => form.id === editingFormId)
    if (!existing || existing.status !== 'DRAFT') {
      toast.error('Save a persisted Draft before publishing it.')
      return
    }
    const ticket = beginOperation('forms.publish')
    if (!ticket) return
    try {
      const published = await formsClient.publishDigitalForm(
        existing.projectId,
        existing.id,
        existing.updatedAt,
      )
      if (!ticket.valid()) return
      setForms((current) => [...current.filter((form) => form.id !== published.id), published])
      setEditingFormId(published.id)
      setSavedNotice('Form published to the server.')
      setView('forms')
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'Form could not be published.')
    } finally {
      ticket.finish()
    }
  }
  const downloadSavedForm = async (summary: SavedForm) => {
    const listed = forms.find((form) => form.id === summary.id)
    if (!listed) {
      toast.error('The selected persisted form could not be found.')
      return
    }
    const ticket = beginOperation('forms.export')
    if (!ticket || listed.projectId !== projectId) {
      ticket?.finish()
      return
    }
    try {
      // The server applies forms.export, project scope, artifact bounds and the audit row.
      const request = formDefinitionExportRequest(listed, exportFormat)
      await downloadCoreArtifact(request.url, request.fileName, () => ticket.valid())
      if (!ticket.valid()) return
      toast.success(
        `Exported ${listed.code} version ${listed.version} as ${exportFormat.toUpperCase()}.`,
      )
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'The form could not be exported.')
    } finally {
      ticket.finish()
    }
  }
  const createNewVersion = async () => {
    if (!editingFormId || creatingVersion) return
    const ticket = beginOperation('forms.manage')
    if (!ticket) return
    setCreatingVersion(true)
    try {
      const created = await formsClient.createDigitalFormVersion(projectId, editingFormId)
      if (!ticket.valid()) return
      setForms((current) => [...current.filter((form) => form.id !== created.id), created])
      setEditingFormId(created.id)
      setHydratedFormId(created.id)
      setEditingBaseUpdatedAt(created.updatedAt)
      setFormCode(created.code)
      setFormTitle(created.name)
      setFormDescription(created.description ?? '')
      setFormType(created.formType)
      setLinkedActivityId(created.activityId ?? '')
      setJourneyStage(created.journeyStageId ?? '')
      setFields(fromDigitalForm(created))
      setSelectedFieldId(fromDigitalForm(created)[0]?.id ?? '')
      setSavedNotice('A new draft version is ready for editing.')
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'A new version could not be created.')
    } finally {
      if (ticket.valid()) setCreatingVersion(false)
      ticket.finish()
    }
  }
  // Clears a field's needs-check items on the server; unsaved field edits in the editor stay as they are.
  const confirmCheck = async (fieldCode: string) => {
    if (!editingFormId || !editingBaseUpdatedAt) return
    const ticket = beginOperation('forms.manage')
    if (!ticket) return
    try {
      const updated = await formsClient.confirmDraftCheck(
        projectId,
        editingFormId,
        fieldCode,
        editingBaseUpdatedAt,
      )
      if (!ticket.valid()) return
      setForms((current) => current.map((form) => (form.id === updated.id ? updated : form)))
      setEditingBaseUpdatedAt(updated.updatedAt)
      const field = fields.find((item) => item.code === fieldCode)
      toast.success(`${field?.label ?? fieldCode} confirmed.`)
      // The Confirm button is gone once the check clears, so focus moves to the field it confirmed.
      if (field)
        window.setTimeout(
          () => document.getElementById(`collection-field-choice-${field.id}`)?.focus(),
          0,
        )
    } catch (error) {
      if (ticket.valid())
        toast.error(error instanceof Error ? error.message : 'The field could not be confirmed.')
    } finally {
      ticket.finish()
    }
  }
  const generateCopy = async () => {
    const source = forms.find((form) => form.id === editingFormId)
    if (!source || creatingVersion) return
    const ticket = beginOperation('forms.generate')
    if (!ticket) return
    setCreatingVersion(true)
    try {
      const suffix = `_copy_${Date.now().toString(36)}`
      const created = await formsClient.generateDigitalForm(projectId, {
        sourceFormId: source.id,
        code: `${source.code.slice(0, 64 - suffix.length)}${suffix}`,
        name: `${source.name.slice(0, 150)} (copy)`,
      })
      if (!ticket.valid()) return
      setForms((current) => [...current, created])
      setSavedNotice(`Generated draft form ${created.name}.`)
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'The form could not be generated.')
    } finally {
      if (ticket.valid()) setCreatingVersion(false)
      ticket.finish()
    }
  }
  return {
    confirmCheck,
    createNewVersion,
    downloadSavedForm,
    generateCopy,
    publishFormToApi,
    saveDraftToApi,
  }
}

export type FormActions = ReturnType<typeof useFormActions>
