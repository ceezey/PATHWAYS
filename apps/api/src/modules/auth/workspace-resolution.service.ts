import { ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
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
  ) {
    if (
      typeof organizationSelector !== 'string' ||
      typeof userSelector !== 'string' ||
      !UUID_PATTERN.test(organizationSelector) ||
      !UUID_PATTERN.test(userSelector)
    ) {
      throw new ForbiddenException('Workspace selection is not available.')
    }
    const profiles = await this.validated(identity)
    const profile = profiles.find(
      (candidate) =>
        candidate.organizationId === organizationSelector.toLowerCase() &&
        candidate.userId === userSelector.toLowerCase(),
    )
    if (!profile) throw new ForbiddenException('Workspace selection is not available.')
    return profile
  }
}
