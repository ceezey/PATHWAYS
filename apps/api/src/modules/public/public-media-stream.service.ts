import {
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { readApiEnv } from '@pathways/config'
import { z } from 'zod'
import { UUID_PATTERN } from '../../common/authz/application-identity'
import { PrismaService } from '../../prisma/prisma.service'
import { storageOptions, streamVerifiedMedia } from '../activities/private-media-access'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'

const liveMedia = z.object({
  bucket: z.string(),
  objectKey: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().positive(),
  sha256: z.string(),
})
const singleRange = /^bytes=(\d+)-(\d*)$/
const notSatisfiable = () => new HttpException('Range not satisfiable.', 416)

@Injectable()
export class PublicMediaStreamService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly factories: PrivateStorageFactories,
  ) {}

  /** Opens the object only while it is on the project's live snapshot; every call re-reads the lookup. */
  async open(projectId: string, mediaId: string, range: string | undefined) {
    if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(mediaId))
      throw new NotFoundException('Media unavailable.')
    let found: unknown
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ media: unknown }>>`
        SELECT pathways.p86_public_media(${projectId}::uuid,${mediaId}::uuid) AS media`
      found = row?.media
    } catch {
      throw new ServiceUnavailableException('Public media is temporarily unavailable.')
    }
    if (found === null || found === undefined) throw new NotFoundException('Media unavailable.')
    const parsed = liveMedia.safeParse(found)
    if (!parsed.success)
      throw new ServiceUnavailableException('Public media is temporarily unavailable.')
    const { bucket, objectKey, contentType, byteSize, sha256 } = parsed.data
    const isVideo = contentType.startsWith('video/')

    if (range === undefined) {
      // The storage key carries the owning organization, so no second lookup is needed.
      const full = await streamVerifiedMedia(this.env, this.factories, {
        organizationId: objectKey.split('/')[1] ?? '',
        projectId,
        row: { id: mediaId, bucket, objectKey, byteSize: BigInt(byteSize), sha256, contentType },
      })
      return {
        status: 200,
        body: full.body,
        contentType,
        length: byteSize,
        isVideo,
        contentRange: undefined,
      }
    }

    const match = isVideo ? singleRange.exec(range) : null
    if (!match) throw notSatisfiable()
    const start = Number(match[1])
    const end = Math.min(match[2] === '' ? byteSize - 1 : Number(match[2]), byteSize - 1)
    if (!Number.isSafeInteger(start) || start > end || start >= byteSize) throw notSatisfiable()
    try {
      const body = await this.factories.createPrivateRangeReader(storageOptions(this.env))({
        bucket,
        objectKey,
        start,
        end,
      })
      return {
        status: 206,
        body,
        contentType,
        length: end - start + 1,
        isVideo,
        contentRange: `bytes ${start}-${end}/${byteSize}`,
      }
    } catch {
      throw new ServiceUnavailableException('Media is temporarily unavailable.')
    }
  }
}
