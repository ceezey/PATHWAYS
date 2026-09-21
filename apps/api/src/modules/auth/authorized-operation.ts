import { performance } from 'node:perf_hooks'

import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import type { PrismaService } from '@app/prisma/prisma.service'
import { prismaDiagnosticCode, transactionDiagnostic } from '../../prisma/transaction-diagnostic'
import { readApplicationProfile } from './application-profile.service'
import { type AtomicPermission, hasAtomicPermission } from './authorization-policy'
import {
  boundedOperationDuration,
  reportAuthorizedOperationTiming,
} from './authorized-operation-timing'
import type { ApplicationIdentity } from './developer-access'

export interface AuthorizedOperationOptions {
  transactionTimeoutMs?: number
}

const logger = new Logger('AuthorizedOperation')

function reportTemporaryDatabaseFailure(code: 'P2024' | 'P2028', error: unknown) {
  try {
    logger.warn({
      event: 'PATHWAYS_AUTHORIZED_OPERATION_UNAVAILABLE',
      stage: code === 'P2024' ? 'CONNECTION_POOL' : 'VERIFIED_TRANSACTION',
      reason: code,
      ...(code === 'P2028' ? transactionDiagnostic(error) : {}),
    })
  } catch {
    // Diagnostics must not expose provider errors or change the safe response.
  }
}

function ownDiagnosticValue(value: unknown, key: string): unknown {
  try {
    return value !== null && typeof value === 'object'
      ? Object.getOwnPropertyDescriptor(value, key)?.value
      : undefined
  } catch {
    return undefined
  }
}

function classifyRejectedDatabaseFailure(error: unknown): string {
  const meta = ownDiagnosticValue(error, 'meta')
  const candidates = [
    ownDiagnosticValue(error, 'message'),
    ownDiagnosticValue(meta, 'database_error'),
    ownDiagnosticValue(meta, 'error'),
  ]

  const diagnosticText = candidates
    .filter((value): value is string => typeof value === 'string' && value.length <= 4_096)
    .join('\n')

  if (diagnosticText.includes('Consent provenance does not match profile and enrollment')) {
    return 'CONSENT_SCOPE_LOCK'
  }

  if (diagnosticText.includes('beneficiary_consent_records_recorded_check')) {
    return 'CONSENT_TIMESTAMP_CHECK'
  }

  if (/new row violates row-level security policy[\s\S]*beneficiaries/i.test(diagnosticText)) {
    return 'BENEFICIARY_INSERT_RLS'
  }

  if (/permission denied for (?:relation|table)[\s\S]*beneficiaries/i.test(diagnosticText)) {
    return 'BENEFICIARY_TABLE_PRIVILEGE'
  }

  if (
    /query would be affected by row-level security policy[\s\S]*beneficiaries/i.test(diagnosticText)
  ) {
    return 'BENEFICIARY_LOCK_RLS'
  }

  if (/row-level security policy[\s\S]*beneficiaries/i.test(diagnosticText)) {
    return 'BENEFICIARY_RLS_OTHER'
  }

  if (
    /row-level security policy.+beneficiary_project_enrollments/i.test(diagnosticText) ||
    /permission denied.+beneficiary_project_enrollments/i.test(diagnosticText)
  ) {
    return 'ENROLLMENT_RLS'
  }

  if (diagnosticText.includes('Response does not satisfy its form field type or bounds')) {
    return 'FORM_RESPONSE_CONSTRAINT'
  }

  if (diagnosticText.includes('Validated submission is missing required or valid responses')) {
    return 'SUBMISSION_RESPONSE_CONSTRAINT'
  }

  if (diagnosticText.includes('Database transaction time is unavailable')) {
    return 'DATABASE_CLOCK_UNAVAILABLE'
  }

  return 'UNCLASSIFIED'
}

function reportRejectedDatabaseFailure(code: string, error: unknown) {
  try {
    logger.warn({
      event: 'PATHWAYS_AUTHORIZED_OPERATION_REJECTED',
      reason: code || 'NO_PRISMA_CODE',
      failure: classifyRejectedDatabaseFailure(error),
    })
  } catch {
    // Diagnostics must never change the safe response.
  }
}

export async function withAuthorizedOperation<T>(
  prisma: PrismaService,
  identity: ApplicationIdentity,
  permission: AtomicPermission,
  work: (tx: Prisma.TransactionClient, profile: ApplicationIdentity) => Promise<T>,
  options?: AuthorizedOperationOptions,
) {
  if (!identity || identity.aal !== 'aal2') throw new ForbiddenException('Verified MFA required.')
  const operationStartedAt = performance.now()
  let profileMs = 0
  let featureMs = 0
  let databaseTiming: { acquisitionMs: number; contextMs: number; workMs: number } | undefined
  try {
    return await prisma.withVerifiedContext(
      {
        authSubject: identity.id,
        organizationId: identity.organizationId,
        userId: identity.userId,
      },
      async (tx) => {
        const profileStartedAt = performance.now()
        let profile: ApplicationIdentity
        try {
          profile = await readApplicationProfile(
            tx,
            identity.id,
            identity.organizationId,
            identity.userId,
          )
        } finally {
          profileMs = boundedOperationDuration(performance.now() - profileStartedAt)
        }
        if (!hasAtomicPermission(profile.roles[0], profile.permissions, permission)) {
          throw new ForbiddenException('Required application permission is missing.')
        }
        const featureStartedAt = performance.now()
        try {
          return await work(tx, profile)
        } finally {
          featureMs = boundedOperationDuration(performance.now() - featureStartedAt)
        }
      },
      {
        ...(options?.transactionTimeoutMs === undefined
          ? {}
          : { timeoutMs: options.transactionTimeoutMs }),
        onTiming: (timing) => {
          databaseTiming = timing
        },
      },
    )
  } catch (error) {
    if (error instanceof HttpException) throw error
    const code = prismaDiagnosticCode(error)
    if (code === 'P2002') {
      throw new ConflictException('A record with that stable or idempotency key already exists.')
    }
    if (code === 'P2034') {
      throw new ConflictException('A concurrent change was detected; retry the request.')
    }
    if (code === 'P2024' || code === 'P2028') {
      reportTemporaryDatabaseFailure(code, error)
      throw new ServiceUnavailableException(
        'The application transaction is temporarily unavailable. Retry shortly.',
      )
    }

    reportRejectedDatabaseFailure(code, error)
    throw new ForbiddenException('Application scope could not be verified.')
  } finally {
    reportAuthorizedOperationTiming(identity, {
      acquisitionMs: databaseTiming?.acquisitionMs ?? 0,
      contextMs: databaseTiming?.contextMs ?? 0,
      profileMs,
      featureMs,
      totalMs: boundedOperationDuration(performance.now() - operationStartedAt),
    })
  }
}
