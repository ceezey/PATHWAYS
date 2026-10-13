// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import type { SaveDigitalFormInput } from '@/types/pathways'
import { formsClient } from './forms'

const projectId = '80100000-0000-4000-8000-000000000001'
const formId = '80100000-0000-4000-8000-000000000002'
const submissionId = '80100000-0000-4000-8000-000000000003'
const beneficiaryId = '80100000-0000-4000-8000-000000000004'
const clientId = '80100000-0000-4000-8000-000000000005'
const formsPath = `/metadata/projects/${projectId}/forms`
const formPath = `${formsPath}/${formId}`
const submissionsPath = `${formPath}/submissions`
const stamp = '2026-10-13T00:00:00.000Z'
const input: SaveDigitalFormInput = {
  code: 'post_test',
  name: 'Post test',
  formType: 'POST_TEST',
  fields: [
    {
      code: 'score',
      label: 'Score',
      dataType: 'INTEGER',
      required: true,
      metadataKey: false,
      sadddField: false,
    },
  ],
}

// The same cases run against the method still on pathwaysClient and against its copy in formsClient.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['formsClient', formsClient],
] as const

describe.each(clients)('%s form and direct entry requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('lists the forms and refuses an answer that is not a list or holds over 100 forms', async () => {
    request.requestFoundation.mockResolvedValue([{ id: formId }])
    await expect(client.getDigitalForms(projectId)).resolves.toEqual([{ id: formId }])
    expect(request.requestFoundation).toHaveBeenCalledWith(formsPath)
    for (const bad of [{}, Array.from({ length: 101 }, () => ({}))]) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(client.getDigitalForms(projectId)).rejects.toThrow('Invalid form response.')
    }
  })

  it('reads one form by its encoded id', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await expect(client.getDigitalForm(projectId, 'a b')).resolves.toEqual({ id: formId })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${formsPath}/a%20b`)
  })

  it('creates and updates a form with the exact definition and the update stamp', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await client.createDigitalForm(projectId, input)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(formsPath, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await client.updateDigitalForm(projectId, formId, { ...input, expectedUpdatedAt: stamp })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(formPath, {
      method: 'PATCH',
      body: JSON.stringify({ ...input, expectedUpdatedAt: stamp }),
    })
  })

  it('publishes with the update stamp, opens a version with no body and generates a copy', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await client.publishDigitalForm(projectId, formId, stamp)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formPath}/publish`, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt: stamp }),
    })
    await client.createDigitalFormVersion(projectId, formId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formPath}/versions`, {
      method: 'POST',
    })
    const copy = { sourceFormId: formId, code: 'post_test_copy', name: 'Post test (copy)' }
    await client.generateDigitalForm(projectId, copy)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formsPath}/generate`, {
      method: 'POST',
      body: JSON.stringify(copy),
    })
  })

  it('validates answers without saving them', async () => {
    request.requestFoundation.mockResolvedValue({ valid: true, values: {}, errors: [] })
    await expect(
      client.validateDigitalFormValues(projectId, formId, { score: '7' }),
    ).resolves.toEqual({ valid: true, values: {}, errors: [] })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${formPath}/validate`, {
      method: 'POST',
      body: JSON.stringify({ values: { score: '7' } }),
    })
  })

  it('saves a submission with the contributor only when one is given', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await client.saveDirectSubmission(projectId, formId, clientId, { score: '7' })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(submissionsPath, {
      method: 'POST',
      body: JSON.stringify({ clientSubmissionId: clientId, values: { score: '7' } }),
    })
    await client.saveDirectSubmission(projectId, formId, clientId, { score: '7' }, beneficiaryId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(submissionsPath, {
      method: 'POST',
      body: JSON.stringify({ clientSubmissionId: clientId, values: { score: '7' }, beneficiaryId }),
    })
  })

  it('reads a submission by its id and by its client id', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await client.getDirectSubmission(projectId, formId, submissionId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${submissionsPath}/${submissionId}`)
    await client.getDirectSubmissionByClientId(projectId, formId, 'a b')
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${submissionsPath}/by-client/a%20b`)
  })

  it('updates and submits a submission with the update stamp', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await client.updateDirectSubmission(projectId, formId, submissionId, stamp, { score: '8' })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${submissionsPath}/${submissionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedUpdatedAt: stamp, values: { score: '8' } }),
      },
    )
    await client.submitDirectSubmission(projectId, formId, submissionId, stamp)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${submissionsPath}/${submissionId}/submit`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: stamp }) },
    )
  })
})
