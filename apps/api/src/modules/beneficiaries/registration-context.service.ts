import { ConflictException } from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import type { Prisma } from '@prisma/client'

import {
  beneficiaryRegistrationDefinitionErrors,
  businessCalendarDate,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { contract, fieldSelection } from './beneficiaries.mapper'

// Supporting output allowlist, independently authorized from collection/form access.
export interface RegistrationContext {
  projectId: string
  businessDate: string
  definitions: {
    id: string
    code: string
    version: number
    name: string
    formType: 'BENEFICIARY_REGISTRATION'
    status: 'PUBLISHED'
    fields: (import('@pathways/shared').FormFieldValidationContract & {
      id: string
      metadataKey: boolean
      sadddField: boolean
      sequence: number
    })[]
  }[]
}

/** The one system template key the 0040 guard and check constraint admit. */
const DEFAULT_REGISTRATION_TEMPLATE_KEY = 'SYSTEM_DEFAULT_REGISTRATION_V1'

/** Caller has already scoped projectId through requireScopedProjectRow. */
export async function loadRegistrationContext(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
): Promise<RegistrationContext> {
  const eligible = {
    organizationId: actor.organizationId,
    projectId,
    formType: 'BENEFICIARY_REGISTRATION' as const,
    status: 'PUBLISHED' as const,
    archivedAt: null,
  }
  const businessDate = businessCalendarDate(new Date(), readApiEnv(process.env).BUSINESS_TIME_ZONE)
  // Bound code discovery before loading any definitions, rather than broad reads filtered in memory.
  // The system default template is offered only when no project-authored form is eligible.
  const discover = (where: Prisma.DigitalFormWhereInput) =>
    tx.digitalForm.groupBy({
      by: ['code'],
      where,
      _max: { version: true },
      orderBy: { code: 'asc' },
      take: 101,
    })
  let where: Prisma.DigitalFormWhereInput = { ...eligible, systemTemplateKey: null }
  let codes = await discover(where)
  if (codes.length === 0) {
    where = { ...eligible, systemTemplateKey: DEFAULT_REGISTRATION_TEMPLATE_KEY }
    codes = await discover(where)
  }
  if (codes.length > 100)
    throw new ConflictException('Registration definitions exceed supported bounds.')
  if (codes.length === 0) return { projectId, businessDate, definitions: [] }
  if (codes.some((item) => item._max.version === null))
    throw new ConflictException('Registration definitions are invalid.')
  const rows = await tx.digitalForm.findMany({
    where: {
      ...where,
      OR: codes.map((item) => ({ code: item.code, version: item._max.version as number })),
    },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
    take: 101,
    select: {
      id: true,
      code: true,
      version: true,
      name: true,
      formType: true,
      status: true,
      formField_form: {
        where: { organizationId: actor.organizationId, projectId },
        take: 101,
        orderBy: [{ sequenceNo: 'asc' }, { id: 'asc' }],
        select: { ...fieldSelection, isMetadataKey: true, isSadddField: true },
      },
    },
  })
  if (rows.length !== codes.length)
    throw new ConflictException('Registration definitions changed. Reload before continuing.')
  const definitions = rows.map((form) => {
    if (
      !/^[a-z][a-z0-9_]{1,63}$/.test(form.code) ||
      form.name.trim().length < 3 ||
      form.name.length > 160 ||
      form.formField_form.length > 100 ||
      form.formField_form.some(
        (field) =>
          field.code.length > 64 ||
          field.label.length > 160 ||
          !Number.isSafeInteger(field.sequenceNo) ||
          field.sequenceNo < 1 ||
          (field.allowedValues !== null &&
            (!Array.isArray(field.allowedValues) ||
              field.allowedValues.length > 100 ||
              field.allowedValues.some(
                (value) => typeof value !== 'string' || value.length > 120,
              ))),
      )
    ) {
      throw new ConflictException('Registration definitions are invalid.')
    }
    const fields = form.formField_form.map((field) => ({
      ...contract(field),
      id: field.id,
      metadataKey: field.isMetadataKey,
      sadddField: field.isSadddField,
      sequence: field.sequenceNo,
    }))
    if (
      beneficiaryRegistrationDefinitionErrors(fields).length ||
      validateAndNormalizeFormData(fields, {}, 'draft').errors.some(
        (error) => error.code === 'invalid_definition',
      )
    ) {
      throw new ConflictException('Registration definitions are invalid.')
    }
    return {
      id: form.id,
      code: form.code,
      version: form.version,
      name: form.name,
      formType: 'BENEFICIARY_REGISTRATION' as const,
      status: 'PUBLISHED' as const,
      fields,
    }
  })
  return { projectId, businessDate, definitions }
}
