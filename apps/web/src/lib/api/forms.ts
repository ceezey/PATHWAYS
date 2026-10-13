import type {
  CreateFormRequest,
  FormResponse,
  FormSubmissionResponse,
  FormValidationResult,
  FormVersionRequest,
  GenerateFormRequest,
  SaveSubmissionRequest,
  SubmitSubmissionRequest,
  UpdateFormRequest,
  UpdateSubmissionRequest,
  ValidateFormValuesRequest,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type { SaveDigitalFormInput } from '@/types/pathways'

export const formsClient = {
  async getDigitalForms(projectId: string): Promise<FormResponse[]> {
    const value = await requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms`,
    )
    if (!Array.isArray(value) || value.length > 100) {
      throw new PathwaysClientError('Invalid form response.', 'network')
    }
    return value as FormResponse[]
  },

  async getDigitalForm(projectId: string, formId: string): Promise<FormResponse> {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}`,
    ) as Promise<FormResponse>
  },

  async createDigitalForm(projectId: string, input: SaveDigitalFormInput): Promise<FormResponse> {
    return requestFoundation(`/metadata/projects/${encodeURIComponent(projectId)}/forms`, {
      method: 'POST',
      body: JSON.stringify(input satisfies CreateFormRequest),
    }) as Promise<FormResponse>
  },

  async updateDigitalForm(
    projectId: string,
    formId: string,
    input: SaveDigitalFormInput & { expectedUpdatedAt: string },
  ): Promise<FormResponse> {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}`,
      { method: 'PATCH', body: JSON.stringify(input satisfies UpdateFormRequest) },
    ) as Promise<FormResponse>
  },

  async publishDigitalForm(projectId: string, formId: string, expectedUpdatedAt: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/publish`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt } satisfies FormVersionRequest) },
    ) as Promise<FormResponse>
  },

  async createDigitalFormVersion(projectId: string, formId: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/versions`,
      { method: 'POST' },
    ) as Promise<FormResponse>
  },

  async generateDigitalForm(
    projectId: string,
    input: { templateKey?: string; sourceFormId?: string; code: string; name: string },
  ) {
    return requestFoundation(`/metadata/projects/${encodeURIComponent(projectId)}/forms/generate`, {
      method: 'POST',
      body: JSON.stringify(input satisfies GenerateFormRequest),
    }) as Promise<FormResponse>
  },

  async validateDigitalFormValues(
    projectId: string,
    formId: string,
    values: Record<string, unknown>,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/validate`,
      { method: 'POST', body: JSON.stringify({ values } satisfies ValidateFormValuesRequest) },
    ) as Promise<FormValidationResult>
  },

  async saveDirectSubmission(
    projectId: string,
    formId: string,
    clientSubmissionId: string,
    values: Record<string, unknown>,
    beneficiaryId?: string,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions`,
      {
        method: 'POST',
        body: JSON.stringify({
          clientSubmissionId,
          values,
          ...(beneficiaryId ? { beneficiaryId } : {}),
        } satisfies SaveSubmissionRequest),
      },
    ) as Promise<FormSubmissionResponse>
  },

  async getDirectSubmission(projectId: string, formId: string, submissionId: string) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
    ) as Promise<FormSubmissionResponse>
  },

  async getDirectSubmissionByClientId(
    projectId: string,
    formId: string,
    clientSubmissionId: string,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/by-client/${encodeURIComponent(clientSubmissionId)}`,
    ) as Promise<FormSubmissionResponse>
  },

  async updateDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    expectedUpdatedAt: string,
    values: Record<string, unknown>,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedUpdatedAt, values } satisfies UpdateSubmissionRequest),
      },
    ) as Promise<FormSubmissionResponse>
  },

  async submitDirectSubmission(
    projectId: string,
    formId: string,
    submissionId: string,
    expectedUpdatedAt: string,
  ) {
    return requestFoundation(
      `/metadata/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedUpdatedAt } satisfies SubmitSubmissionRequest),
      },
    ) as Promise<FormSubmissionResponse>
  },
}
