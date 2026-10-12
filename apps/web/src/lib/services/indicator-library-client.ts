import { requestFoundation } from '@/lib/api/core/request'
import {
  type CreateLibraryEntryInput,
  type LibraryEntry,
  libraryEntrySchema,
} from '@pathways/shared'

export const indicatorLibraryClient = {
  async list(): Promise<LibraryEntry[]> {
    const rows = await requestFoundation('/indicator-library')
    return libraryEntrySchema.array().parse(rows)
  },
  async create(input: CreateLibraryEntryInput): Promise<LibraryEntry> {
    return libraryEntrySchema.parse(
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
