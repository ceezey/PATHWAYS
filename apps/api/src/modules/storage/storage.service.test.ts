import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = vi.hoisted(() => ({
  createClient: vi.fn(),
  getBucket: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: provider.createClient }))

import { StorageService } from './storage.service'

const originalUrl = process.env.SUPABASE_URL
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe('private Storage adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://synthetic-project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role-key'
    provider.createClient.mockReturnValue({
      storage: {
        getBucket: provider.getBucket,
        from: () => ({ upload: provider.upload, download: provider.download }),
      },
    })
  })

  afterEach(() => {
    if (originalUrl === undefined) process.env.SUPABASE_URL = undefined
    else process.env.SUPABASE_URL = originalUrl
    if (originalServiceKey === undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = undefined
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey
  })

  it('uploads only to a confirmed private bucket without overwriting an object', async () => {
    provider.getBucket.mockResolvedValue({ data: { public: false }, error: null })
    provider.upload.mockResolvedValue({ data: { path: 'scoped/file.csv' }, error: null })
    const service = new StorageService()

    await service.uploadPrivateFile('uploads', 'scoped/file.csv', Buffer.from('x'), 'text/csv')

    expect(provider.getBucket).toHaveBeenCalledWith('uploads')
    expect(provider.upload).toHaveBeenCalledWith('scoped/file.csv', expect.any(Buffer), {
      contentType: 'text/csv',
      upsert: false,
      cacheControl: 'no-store',
    })
  })

  it('fails closed before upload or download when the bucket is public', async () => {
    provider.getBucket.mockResolvedValue({ data: { public: true }, error: null })
    const service = new StorageService()

    await expect(
      service.uploadPrivateFile('uploads', 'scoped/file.csv', Buffer.from('x'), 'text/csv'),
    ).rejects.toThrow(/not private/)
    await expect(service.downloadPrivateFile('uploads', 'scoped/file.csv')).rejects.toThrow(
      /not private/,
    )
    expect(provider.upload).not.toHaveBeenCalled()
    expect(provider.download).not.toHaveBeenCalled()
  })

  it('returns private object bytes without creating a signed or public URL', async () => {
    provider.getBucket.mockResolvedValue({ data: { public: false }, error: null })
    provider.download.mockResolvedValue({
      data: { arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer },
      error: null,
    })
    const service = new StorageService()

    await expect(service.downloadPrivateFile('uploads', 'scoped/file.csv')).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    )
  })
})
