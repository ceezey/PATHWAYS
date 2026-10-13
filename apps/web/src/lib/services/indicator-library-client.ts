import { requestFoundation } from '@/lib/api/core/request'
import {
  type CreateIndicatorLibraryEntryRequest,
  type IndicatorLibraryEntryResponse,
  indicatorLibraryEntryResponse,
} from '@pathways/shared'

export const indicatorLibraryClient = {
  async list(): Promise<IndicatorLibraryEntryResponse[]> {
    const rows = await requestFoundation('/indicator-library')
    return indicatorLibraryEntryResponse.array().parse(rows)
  },
  async create(input: CreateIndicatorLibraryEntryRequest): Promise<IndicatorLibraryEntryResponse> {
    return indicatorLibraryEntryResponse.parse(
      await requestFoundation('/indicator-library', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },
  async archive(entryId: string): Promise<void> {
    await requestFoundation(`/indicator-library/${encodeURIComponent(entryId)}/archive`, {
      method: 'POST',
    })
  },
}
