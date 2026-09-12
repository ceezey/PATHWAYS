import { ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { z } from 'zod'

import { ApplicationProfileService } from './application-profile.service'
import { hasAtomicPermission } from './authorization-policy'
import {
  type ApplicationIdentity,
  DEVELOPER_AUTH_UUID,
  DEVELOPER_SUPABASE_URL,
  UUID_PATTERN,
  type VerifiedAuthIdentity,
  developerApplicationAccessEnabled,
} from './developer-access'

const candidatesSchema = z
  .array(
    z
      .object({
        authUserId: z.literal(DEVELOPER_AUTH_UUID),
        organizationId: z
          .string()
          .uuid()
          .transform((id) => id.toLowerCase()),
        userId: z
          .string()
          .uuid()
          .transform((id) => id.toLowerCase()),
      })
      .strict(),
  )
  .max(8)

const unavailable = () =>
  new ServiceUnavailableException('Workspace verification is temporarily unavailable.')

/** Prototype-only D1 adapter. Configuration supplies bounded search candidates,
 * NEVER membership, role grants, fixtures-as-authority, or a privileged DB client.
 * No cache: each protected request re-runs the runtime/RLS/profile boundary.
 */
@Injectable()
export class WorkspaceResolutionService {
  constructor(
    @Inject(ApplicationProfileService) private readonly profiles: ApplicationProfileService,
  ) {}

  private candidates(identity: VerifiedAuthIdentity) {
    if (
      identity.id !== DEVELOPER_AUTH_UUID ||
      identity.aal !== 'aal2' ||
      !developerApplicationAccessEnabled()
    ) {
      throw new ForbiddenException('Workspace access is not available.')
    }
    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.PATHWAYS_DEVELOPER_WORKSPACE_RESOLUTION_ENABLED !== 'true' ||
      process.env.SUPABASE_URL !== DEVELOPER_SUPABASE_URL
    )
      throw unavailable()
    const raw = process.env.PATHWAYS_DEVELOPER_WORKSPACE_CANDIDATES
    if (!raw || raw.length > 8192) throw unavailable()
    try {
      const parsed = candidatesSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) throw unavailable()
      const keys = parsed.data.map((candidate) => `${candidate.organizationId}:${candidate.userId}`)
      if (new Set(keys).size !== keys.length) throw unavailable()
      return parsed.data
    } catch {
      // Never serialize configuration, Zod input, candidates, or provider errors.
      throw unavailable()
    }
  }

  private async validated(identity: VerifiedAuthIdentity): Promise<ApplicationIdentity[]> {
    const candidates = this.candidates(identity)
    const profiles: ApplicationIdentity[] = []
    for (const candidate of candidates) {
      let profile: ApplicationIdentity
      try {
        profile = await this.profiles.resolve(
          identity.id,
          candidate.organizationId,
          candidate.userId,
        )
      } catch (error) {
        if (error instanceof ForbiddenException) continue
        throw unavailable()
      }
      if (
        profile.id !== identity.id ||
        profile.aal !== 'aal2' ||
        profile.userId !== candidate.userId ||
        profile.organizationId !== candidate.organizationId
      )
        throw unavailable()
      if (
        profile.roles.length !== 1 ||
        !hasAtomicPermission(profile.roles[0], profile.permissions, 'projects.read')
      )
        continue
      profiles.push(profile)
    }
    // SystemUser.authUserId is globally unique. Do not select the first result
    // if schema/configuration violates the approved single-workspace contract.
    if (profiles.length > 1) throw unavailable()
    return profiles
  }

  async discover(identity: VerifiedAuthIdentity) {
    const profiles = await this.validated(identity)
    return {
      authUserId: identity.id,
      prototypeOnly: true as const,
      workspaces: profiles.map((profile) => ({
        userId: profile.userId,
        organizationId: profile.organizationId,
        displayName:
          profile.organizationName
            // biome-ignore lint/suspicious/noControlCharactersInRegex: Strip controls from a display label, not from an authorization identifier.
            ?.replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
            .slice(0, 120) || 'Development workspace',
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
    )
      throw new ForbiddenException('Workspace selection is not available.')
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
