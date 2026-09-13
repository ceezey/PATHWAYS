import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { PrismaService } from '../../prisma/prisma.service'
import { prismaDiagnosticCode, transactionDiagnostic } from '../../prisma/transaction-diagnostic'
import { hasAtomicPermission, isCanonicalRole } from './authorization-policy'
import { type ApplicationIdentity, UUID_PATTERN } from './developer-access'

type ProfileRow = {
  id: string
  organizationId: string
  organization: { name: string }
  fullName: string
  role: { code: string; rolePermissions: { permission: { code: string } }[] }
}

/** Re-read inside each business transaction; never authorize from cached roles. */
export async function readApplicationProfile(
  transaction: Prisma.TransactionClient,
  authSubject: string,
  organizationId: string,
  userId: string,
): Promise<ApplicationIdentity> {
  // The default Prisma relation strategy performs several sequential reads here.
  // Join the same active profile/organization/role/grants in one parameterized
  // SELECT, on the SAME runtime transaction and under the SAME table RLS.
  // No definer helper, global/request cache or previously resolved authority.
  const rows = await transaction.$queryRaw<ProfileRow[]>`
    SELECT u.id::text AS id, u.organization_id::text AS "organizationId",
      u.full_name AS "fullName", jsonb_build_object('name', o.name) AS organization,
      jsonb_build_object('code', r.code, 'rolePermissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('permission', jsonb_build_object('code', p.code))
          ORDER BY p.code)
        FROM pathways.role_permissions rp
        JOIN pathways.permissions p ON p.id = rp.permission_id AND p.is_active
        WHERE rp.role_id = r.id
      ), '[]'::jsonb)) AS role
    FROM pathways.system_users u
    JOIN pathways.organizations o ON o.id = u.organization_id
    JOIN pathways.roles r ON r.id = u.role_id
    WHERE u.id = ${userId}::uuid AND u.auth_user_id = ${authSubject}::uuid
      AND u.organization_id = ${organizationId}::uuid
      AND u.account_status = 'ACTIVE' AND u.archived_at IS NULL
      AND o.status = 'ACTIVE' AND o.archived_at IS NULL AND r.is_active
  `
  const profile = rows[0]
  if (rows.length !== 1 || !profile || !isCanonicalRole(profile.role.code)) {
    throw new ForbiddenException('No active application profile.')
  }
  const assignments = await transaction.userProjectAssignment.findMany({
    where: {
      organizationId,
      userId,
      status: 'ACTIVE',
      endedAt: null,
      assignedAt: { lte: new Date() },
      project: { organizationId, archivedAt: null },
    },
    select: { projectId: true },
  })
  return {
    id: authSubject,
    aal: 'aal2',
    userId: profile.id,
    organizationId: profile.organizationId,
    organizationName: profile.organization.name,
    fullName: profile.fullName,
    roles: [profile.role.code],
    permissions: profile.role.rolePermissions
      .map(({ permission }) => permission.code)
      .filter((code) => hasAtomicPermission(profile.role.code, [code], code)),
    assignedProjectIds: [...new Set(assignments.map(({ projectId }) => projectId))],
  }
}

@Injectable()
export class ApplicationProfileService {
  private readonly logger = new Logger(ApplicationProfileService.name)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(
    authSubject: string,
    organizationSelector: unknown,
    userSelector: unknown,
  ): Promise<ApplicationIdentity> {
    if (
      typeof authSubject !== 'string' ||
      !UUID_PATTERN.test(authSubject) ||
      typeof organizationSelector !== 'string' ||
      typeof userSelector !== 'string' ||
      !UUID_PATTERN.test(organizationSelector) ||
      !UUID_PATTERN.test(userSelector)
    ) {
      throw new ForbiddenException('A provisioned application context is required.')
    }
    const organizationId = organizationSelector.toLowerCase()
    const userId = userSelector.toLowerCase()
    try {
      // Headers are untrusted selectors ONLY. Immutable 0005 RLS checks all three
      // identifiers against the active database linkage before allowing any read.
      return await this.prisma.withVerifiedContext(
        { authSubject, organizationId, userId },
        (transaction) => readApplicationProfile(transaction, authSubject, organizationId, userId),
      )
    } catch (error) {
      // Fixed diagnostics only: never serialize provider errors, SQL, headers,
      // selectors, JWTs or connection settings into logs or public responses.
      const code = prismaDiagnosticCode(error)
      try {
        this.logger.warn({
          event: 'PATHWAYS_PROFILE_LOOKUP_DENIED',
          reason: code || 'CONTEXT_OR_PROFILE_UNAVAILABLE',
          ...transactionDiagnostic(error),
        })
      } catch {
        // Diagnostics must not expose provider errors or change the denial.
      }
      if (
        error instanceof ForbiddenException ||
        (error instanceof Error &&
          error.message === 'Database context is not linked to an active application identity.')
      ) {
        throw new ForbiddenException(
          'Application access is unavailable for this identity and context.',
        )
      }
      // A database/configuration outage must never masquerade as zero membership.
      throw new ServiceUnavailableException(
        'Application access verification is temporarily unavailable. Retry shortly.',
      )
    }
  }
}
