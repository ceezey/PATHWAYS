import {
  type RestoreRecoveryPointRequest,
  recoveryPointDownload,
  recoveryPointList,
  recoveryPointListItem,
  recoveryPointVerifyResult,
  restoreRecoveryPointResult,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead } from '@/lib/api/core/owned-json-read'

// The point path of a request, refusing an id that is not a UUID before any request is made.
const pointPath = (id: string) => `/backups/${z.guid().parse(id)}`

export const backupsClient = {
  list: (signal?: AbortSignal) => ownedJsonRead('/backups', recoveryPointList, { signal }),
  create: () => ownedJsonRead('/backups', recoveryPointListItem, { method: 'POST' }),
  verify: async (pointId: string) =>
    ownedJsonRead(`${pointPath(pointId)}/verify`, recoveryPointVerifyResult, { method: 'POST' }),
  download: async (pointId: string) =>
    ownedJsonRead(`${pointPath(pointId)}/download`, recoveryPointDownload, { method: 'POST' }),
  restore: async (pointId: string, input: RestoreRecoveryPointRequest) =>
    ownedJsonPost(`${pointPath(pointId)}/restore`, restoreRecoveryPointResult, input),
}
