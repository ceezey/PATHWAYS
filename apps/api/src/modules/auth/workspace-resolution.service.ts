import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'

import { PrismaService, type VerifiedTransactionTiming } from '../../prisma/prisma.service'
import { ApplicationProfileService } from './application-profile.service'
import { hasAtomicPermission } from './authorization-policy'
import {
  type ApplicationIdentity,
  UUID_PATTERN,
  type VerifiedAuthIdentity,
} from './developer-access'

const unavailable = () =>
  new ServiceUnavailableException('Workspace verification is temporarily unavailable.')

/** Resolve the one v1 workspace linked to a verified Supabase Auth subject.
 * Discovery returns selectors only. Full profile, RLS, role and permission
 * validation is repeated before those selectors authorize any operation.
 */
@Injectable()
export class WorkspaceResolutionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ApplicationProfileService) private readonly profiles: ApplicationProfileService,
  ) {}

  private async validated(identity: VerifiedAuthIdentity): Promise<ApplicationIdentity[]> {
    if (identity.aal !== 'aal2' || !UUID_PATTERN.test(identity.id)) {
      throw new ForbiddenException('Workspace access is not available.')
    }
    try {
      const selectors = await this.prisma.discoverWorkspace(identity.id)
      if (selectors.length > 1) throw unavailable()
      const profiles: ApplicationIdentity[] = []
      for (const selector of selectors) {
        const profile = await this.profiles.resolve(
          identity.id,
          selector.organizationId,
          selector.userId,
        )
        if (
          profile.id !== identity.id ||
          profile.aal !== 'aal2' ||
          profile.userId !== selector.userId ||
          profile.organizationId !== selector.organizationId
        ) {
          throw unavailable()
        }
        if (
          profile.roles.length === 1 &&
          hasAtomicPermission(profile.roles[0], profile.permissions, 'projects.read')
        ) {
          profiles.push(profile)
        }
      }
      return profiles
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      throw unavailable()
    }
  }

  async discover(identity: VerifiedAuthIdentity) {
    const profiles = await this.validated(identity)
    return {
      authUserId: identity.id,
      workspaces: profiles.map((profile) => ({
        userId: profile.userId,
        organizationId: profile.organizationId,
        displayName:
          profile.organizationName
            // biome-ignore lint/suspicious/noControlCharactersInRegex: Strip controls from a display label, never an authorization identifier.
            ?.replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
            .slice(0, 120) || 'PATHWAYS workspace',
      })),
    }
  }

  async resolveSelection(
    identity: VerifiedAuthIdentity,
    organizationSelector: unknown,
    userSelector: unknown,
    sessionId: unknown,
    onTiming?: (timing: VerifiedTransactionTiming) => void,
  ) {
    if (
      identity.aal !== 'aal2' ||
      !UUID_PATTERN.test(identity.id) ||
      typeof organizationSelector !== 'string' ||
      typeof userSelector !== 'string' ||
      typeof sessionId !== 'string' ||
      !UUID_PATTERN.test(organizationSelector) ||
      !UUID_PATTERN.test(userSelector) ||
      !UUID_PATTERN.test(sessionId)
    ) {
      throw new ForbiddenException('Workspace selection is not available.')
    }
    const organizationId = organizationSelector.toLowerCase()
    const userId = userSelector.toLowerCase()
    try {
      // A selected protected request already supplies both untrusted selectors.
      // Resolve them directly in the verified RLS context instead of first opening
      // a separate discovery transaction. The profile read still revalidates the
      // active account, organization, role, permissions and assignments on every
      // request, so revocation remains effective on the next request.
      const profile = onTiming
        ? await this.profiles.resolveWithSession(
            identity.id,
            sessionId,
            organizationId,
            userId,
            onTiming,
          )
        : await this.profiles.resolveWithSession(identity.id, sessionId, organizationId, userId)
      if (
        profile.id !== identity.id ||
        profile.aal !== 'aal2' ||
        profile.userId !== userId ||
        profile.organizationId !== organizationId
      ) {
        throw unavailable()
      }
      if (
        profile.roles.length !== 1 ||
        !hasAtomicPermission(profile.roles[0], profile.permissions, 'projects.read')
      ) {
        throw new ForbiddenException('Workspace selection is not available.')
      }
      return profile
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) throw error
      throw unavailable()
    }
  }
}
