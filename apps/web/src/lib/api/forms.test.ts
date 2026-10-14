// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { PathwaysClientError } from '@/lib/api/core/request'
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

describe('formsClient form and direct entry requests', () => {
  beforeEach(() => {
    request.requestFoundation.mockReset()
  })

  it('lists the forms and refuses an answer that is not a list or holds over 100 forms', async () => {
    request.requestFoundation.mockResolvedValue([{ id: formId }])
    await expect(formsClient.getDigitalForms(projectId)).resolves.toEqual([{ id: formId }])
    expect(request.requestFoundation).toHaveBeenCalledWith(formsPath)
  })

  it('accepts exactly 100 forms and refuses 101, null and a string with a network error', async () => {
    const full = Array.from({ length: 100 }, () => ({}))
    request.requestFoundation.mockResolvedValue(full)
    await expect(formsClient.getDigitalForms(projectId)).resolves.toBe(full)
    for (const bad of [{}, Array.from({ length: 101 }, () => ({})), null, 'forms']) {
      request.requestFoundation.mockResolvedValue(bad)
      await expect(formsClient.getDigitalForms(projectId)).rejects.toMatchObject({
        name: 'PathwaysClientError',
        code: 'network',
        message: 'Invalid form response.',
      })
    }
  })

  it('lets a request failure through as the same error', async () => {
    const failure = new PathwaysClientError('x', 'forbidden')
    request.requestFoundation.mockRejectedValue(failure)
    await expect(formsClient.getDigitalForms(projectId)).rejects.toBe(failure)
  })

  it('reads one form by its encoded id', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await expect(formsClient.getDigitalForm(projectId, 'a b')).resolves.toEqual({ id: formId })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${formsPath}/a%20b`)
  })

  it('creates and updates a form with the exact definition and the update stamp', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await formsClient.createDigitalForm(projectId, input)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(formsPath, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    await formsClient.updateDigitalForm(projectId, formId, { ...input, expectedUpdatedAt: stamp })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(formPath, {
      method: 'PATCH',
      body: JSON.stringify({ ...input, expectedUpdatedAt: stamp }),
    })
  })

  it('publishes with the update stamp, opens a version with no body and generates a copy', async () => {
    request.requestFoundation.mockResolvedValue({ id: formId })
    await formsClient.publishDigitalForm(projectId, formId, stamp)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formPath}/publish`, {
      method: 'POST',
      body: JSON.stringify({ expectedUpdatedAt: stamp }),
    })
    await formsClient.createDigitalFormVersion(projectId, formId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formPath}/versions`, {
      method: 'POST',
    })
    const copy = { sourceFormId: formId, code: 'post_test_copy', name: 'Post test (copy)' }
    await formsClient.generateDigitalForm(projectId, copy)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${formsPath}/generate`, {
      method: 'POST',
      body: JSON.stringify(copy),
    })
  })

  it('validates answers without saving them', async () => {
    request.requestFoundation.mockResolvedValue({ valid: true, values: {}, errors: [] })
    await expect(
      formsClient.validateDigitalFormValues(projectId, formId, { score: '7' }),
    ).resolves.toEqual({ valid: true, values: {}, errors: [] })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${formPath}/validate`, {
      method: 'POST',
      body: JSON.stringify({ values: { score: '7' } }),
    })
  })

  it('saves a submission with the contributor only when one is given', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await formsClient.saveDirectSubmission(projectId, formId, clientId, { score: '7' })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(submissionsPath, {
      method: 'POST',
      body: JSON.stringify({ clientSubmissionId: clientId, values: { score: '7' } }),
    })
    await formsClient.saveDirectSubmission(
      projectId,
      formId,
      clientId,
      { score: '7' },
      beneficiaryId,
    )
    expect(request.requestFoundation).toHaveBeenLastCalledWith(submissionsPath, {
      method: 'POST',
      body: JSON.stringify({ clientSubmissionId: clientId, values: { score: '7' }, beneficiaryId }),
    })
    await formsClient.saveDirectSubmission(projectId, formId, clientId, { score: '7' }, '')
    expect(request.requestFoundation).toHaveBeenLastCalledWith(submissionsPath, {
      method: 'POST',
      body: JSON.stringify({ clientSubmissionId: clientId, values: { score: '7' } }),
    })
  })

  it('reads a submission by its id and by its client id', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await formsClient.getDirectSubmission(projectId, formId, submissionId)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${submissionsPath}/${submissionId}`)
    await formsClient.getDirectSubmissionByClientId(projectId, formId, 'a b')
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${submissionsPath}/by-client/a%20b`)
  })

  it('updates and submits a submission with the update stamp', async () => {
    request.requestFoundation.mockResolvedValue({ id: submissionId })
    await formsClient.updateDirectSubmission(projectId, formId, submissionId, stamp, { score: '8' })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${submissionsPath}/${submissionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedUpdatedAt: stamp, values: { score: '8' } }),
      },
    )
    await formsClient.submitDirectSubmission(projectId, formId, submissionId, stamp)
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `${submissionsPath}/${submissionId}/submit`,
      { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: stamp }) },
    )
  })

  // Every id is 'a b' so each encodeURIComponent shows in the path; init says whether the call carries a second argument.
  const odd = 'a b'
  const formsBase = '/metadata/projects/a%20b/forms'
  const submissions = `${formsBase}/a%20b/submissions`
  const sentinel = { marker: 'response' }
  const calls = [
    {
      name: 'getDigitalForms',
      run: () => formsClient.getDigitalForms(odd),
      path: formsBase,
      init: false,
      list: true,
    },
    {
      name: 'getDigitalForm',
      run: () => formsClient.getDigitalForm(odd, odd),
      path: `${formsBase}/a%20b`,
      init: false,
    },
    {
      name: 'createDigitalForm',
      run: () => formsClient.createDigitalForm(odd, input),
      path: formsBase,
      init: true,
    },
    {
      name: 'updateDigitalForm',
      run: () => formsClient.updateDigitalForm(odd, odd, { ...input, expectedUpdatedAt: stamp }),
      path: `${formsBase}/a%20b`,
      init: true,
    },
    {
      name: 'publishDigitalForm',
      run: () => formsClient.publishDigitalForm(odd, odd, stamp),
      path: `${formsBase}/a%20b/publish`,
      init: true,
    },
    {
      name: 'createDigitalFormVersion',
      run: () => formsClient.createDigitalFormVersion(odd, odd),
      path: `${formsBase}/a%20b/versions`,
      init: true,
    },
    {
      name: 'generateDigitalForm',
      run: () =>
        formsClient.generateDigitalForm(odd, { code: 'post_test_copy', name: 'Post test (copy)' }),
      path: `${formsBase}/generate`,
      init: true,
    },
    {
      name: 'validateDigitalFormValues',
      run: () => formsClient.validateDigitalFormValues(odd, odd, {}),
      path: `${formsBase}/a%20b/validate`,
      init: true,
    },
    {
      name: 'saveDirectSubmission',
      run: () => formsClient.saveDirectSubmission(odd, odd, odd, {}),
      path: submissions,
      init: true,
    },
    {
      name: 'getDirectSubmission',
      run: () => formsClient.getDirectSubmission(odd, odd, odd),
      path: `${submissions}/a%20b`,
      init: false,
    },
    {
      name: 'getDirectSubmissionByClientId',
      run: () => formsClient.getDirectSubmissionByClientId(odd, odd, odd),
      path: `${submissions}/by-client/a%20b`,
      init: false,
    },
    {
      name: 'updateDirectSubmission',
      run: () => formsClient.updateDirectSubmission(odd, odd, odd, stamp, {}),
      path: `${submissions}/a%20b`,
      init: true,
    },
    {
      name: 'submitDirectSubmission',
      run: () => formsClient.submitDirectSubmission(odd, odd, odd, stamp),
      path: `${submissions}/a%20b/submit`,
      init: true,
    },
  ]

  it('encodes every id into the exact path and passes no argument besides the init', async () => {
    for (const { name, run, path, init } of calls) {
      request.requestFoundation.mockReset()
      request.requestFoundation.mockResolvedValue(sentinel)
      await run().catch(() => undefined)
      const [call] = request.requestFoundation.mock.calls
      expect(call[0], name).toBe(path)
      expect(call, name).toHaveLength(init ? 2 : 1)
    }
  })

  it('returns the response object untouched', async () => {
    request.requestFoundation.mockResolvedValue(sentinel)
    for (const { name, run, list } of calls) {
      if (!list) await expect(run(), name).resolves.toBe(sentinel)
    }
  })
})
