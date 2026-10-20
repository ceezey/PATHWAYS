import type {
  BeneficiaryResponse,
  DuplicateCandidatePairResponse,
  RegisterBeneficiaryRequest,
  ResolveDuplicateRequest,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import type {
  BeneficiaryFilters,
  BeneficiaryRecord,
  BeneficiaryRegistrationContext,
  UpdateBeneficiaryInput,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

import { mapBeneficiary, parseRegistrationContext } from './beneficiaries.schema'

export const beneficiariesClient = {
  async getBeneficiaryRecordsForRole(
    _role: PathwaysRole,
    projectId?: string,
    filters?: BeneficiaryFilters,
    signal?: AbortSignal,
  ): Promise<BeneficiaryRecord[]> {
    if (!projectId) return []
    const params = new URLSearchParams()

    const search = filters?.search?.trim()

    if (search) params.set('search', search)
    if (filters?.sex) params.set('sex', filters.sex)
    if (filters?.ageBand) params.set('ageBand', filters.ageBand)
    if (filters?.disabilityStatus) params.set('disabilityStatus', filters.disabilityStatus)

    if (filters?.enrollmentStatus) {
      params.set('enrollmentStatus', filters.enrollmentStatus)
    }

    params.set('limit', '50')
    const records: BeneficiaryRecord[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    do {
      if (cursor) params.set('cursor', cursor)
      const value = (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}?${params.toString()}`,
        { signal },
      )) as { items?: unknown; nextCursor?: unknown }
      if (
        !Array.isArray(value.items) ||
        value.items.length > 50 ||
        (value.nextCursor !== null && typeof value.nextCursor !== 'string')
      ) {
        throw new PathwaysClientError('Invalid beneficiary response.', 'network')
      }
      records.push(...value.items.map((row) => mapBeneficiary(row as BeneficiaryResponse)))
      cursor = value.nextCursor
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new PathwaysClientError('Invalid beneficiary pagination.', 'network')
        }
        seenCursors.add(cursor)
      }
    } while (cursor)

    return records
  },

  async getSurveySubjectPage(
    projectId: string,
    search = '',
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (
      !uuid.test(projectId) ||
      search.trim().length > 80 ||
      (cursor !== undefined && !uuid.test(cursor))
    )
      throw new PathwaysClientError('Invalid contributor search.', 'invalid')
    const params = new URLSearchParams({ enrollmentStatus: 'ACTIVE', limit: '25' })
    if (search.trim()) params.set('search', search.trim())
    if (cursor) params.set('cursor', cursor)
    const page = (await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}?${params}`,
      { signal },
    )) as { items?: unknown; nextCursor?: unknown }
    if (
      !page ||
      typeof page !== 'object' ||
      Array.isArray(page) ||
      !Array.isArray(page.items) ||
      page.items.length > 25 ||
      (page.nextCursor !== null &&
        (typeof page.nextCursor !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(page.nextCursor)))
    )
      throw new PathwaysClientError('Invalid contributor page.', 'network')
    const items = page.items
      .map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new PathwaysClientError('Invalid contributor response.', 'network')
        const record = value as Record<string, unknown>
        if (
          typeof record.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id) ||
          record.projectId !== projectId ||
          typeof record.code !== 'string' ||
          !record.code.length ||
          record.code.length > 64 ||
          typeof record.displayName !== 'string' ||
          !record.displayName.length ||
          record.displayName.length > 240 ||
          !['INDIVIDUAL', 'GROUP', 'COMMUNITY', 'UNSPECIFIED_LEGACY'].includes(
            String(record.subjectType),
          ) ||
          typeof record.consentRecorded !== 'boolean' ||
          typeof record.dataProcessingConsentRecorded !== 'boolean' ||
          !record.enrollment ||
          typeof record.enrollment !== 'object' ||
          Array.isArray(record.enrollment) ||
          (record.enrollment as Record<string, unknown>).projectId !== projectId
        )
          throw new PathwaysClientError('Contributor scope could not be verified.', 'network')
        return record
      })
      .filter(
        (record) =>
          record.subjectType === 'INDIVIDUAL' &&
          record.status === 'ACTIVE' &&
          record.consentRecorded &&
          record.dataProcessingConsentRecorded &&
          (record.enrollment as Record<string, unknown>).status === 'ACTIVE' &&
          ((record.enrollment as Record<string, unknown>).endedDate === null ||
            (record.enrollment as Record<string, unknown>).endedDate === undefined),
      )
      .map((record) => ({
        id: record.id as string,
        code: record.code as string,
        displayName: record.displayName as string,
      }))
    return { items, nextCursor: page.nextCursor as string | null }
  },

  async getBeneficiaryRecordForRole(
    _role: PathwaysRole,
    projectId: string,
    id: string,
  ): Promise<BeneficiaryRecord> {
    if (!projectId) throw new PathwaysClientError('Project scope is required.', 'invalid')
    return mapBeneficiary(
      (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(id)}`,
      )) as BeneficiaryResponse,
    )
  },

  async registerBeneficiary(
    projectId: string,
    input: RegisterBeneficiaryRequest,
  ): Promise<BeneficiaryRecord> {
    return mapBeneficiary(
      (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/registrations`,
        { method: 'POST', body: JSON.stringify(input) },
      )) as BeneficiaryResponse,
    )
  },

  async updateBeneficiary(
    projectId: string,
    beneficiaryId: string,
    input: UpdateBeneficiaryInput,
  ): Promise<BeneficiaryRecord> {
    return mapBeneficiary(
      (await requestFoundation(
        `/beneficiaries/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(beneficiaryId)}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      )) as BeneficiaryResponse,
    )
  },

  async getDuplicateCandidates(projectId: string): Promise<DuplicateCandidatePairResponse[]> {
    return (await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/duplicate-candidates`,
    )) as DuplicateCandidatePairResponse[]
  },

  async resolveDuplicate(projectId: string, input: ResolveDuplicateRequest): Promise<void> {
    await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/duplicate-candidates/resolve`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  },

  async getBeneficiaryRegistrationContext(
    projectId: string,
  ): Promise<BeneficiaryRegistrationContext> {
    if (!projectId) throw new PathwaysClientError('Project scope is required.', 'invalid')
    const value = await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/registration-context`,
    )
    try {
      return parseRegistrationContext(value, projectId)
    } catch {
      throw new PathwaysClientError('Invalid registration context response.', 'network')
    }
  },

  // cr-pathways-default-registration-form: provisions only the fixed system template for a
  // project the registrar can already register into, and returns the same blank context shape.
  async ensureDefaultRegistrationForm(projectId: string): Promise<BeneficiaryRegistrationContext> {
    if (!projectId) throw new PathwaysClientError('Project scope is required.', 'invalid')
    const value = await requestFoundation(
      `/beneficiaries/projects/${encodeURIComponent(projectId)}/registration-context/default-form`,
      { method: 'POST' },
    )
    try {
      return parseRegistrationContext(value, projectId)
    } catch {
      throw new PathwaysClientError('Invalid registration context response.', 'network')
    }
  },
}
