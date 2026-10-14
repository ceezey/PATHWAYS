import { rulesHumanClient } from '@/lib/api/rules'

const OPEN_ALERT_STATUSES = ['NEW', 'REVIEWED', 'ACTIONED'] as const
const OPEN_ALERT_MAX_PAGES = 10

/**
 * Counts open alerts with the server status filter, following cursors per status. It stops
 * after OPEN_ALERT_MAX_PAGES pages of a status and reports `capped` so the UI shows "N+".
 */
export const countOpenAlerts = async (projectId: string, signal?: AbortSignal) => {
  let count = 0
  let capped = false
  for (const status of OPEN_ALERT_STATUSES) {
    let cursor: string | undefined
    for (let page = 0; ; page += 1) {
      const result = await rulesHumanClient.listAlerts(
        { projectId, status, limit: '100', ...(cursor ? { cursor } : {}) },
        signal,
      )
      count += result.items.length
      if (!result.nextCursor) break
      if (page + 1 >= OPEN_ALERT_MAX_PAGES) {
        capped = true
        break
      }
      cursor = result.nextCursor
    }
  }
  return { count, capped }
}
