import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = vi.hoisted(() => ({
  createClient: vi.fn(),
  getBucket: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  createSignedUploadUrl: vi.fn(),
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
        from: () => ({
          upload: provider.upload,
          download: provider.download,
          createSignedUploadUrl: provider.createSignedUploadUrl,
        }),
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

  it('signs upload URLs for exact keys with upsert disabled, one bucket check and one client', async () => {
    provider.getBucket.mockResolvedValue({ data: { public: false }, error: null })
    provider.createSignedUploadUrl.mockImplementation(async (path: string) => ({
      data: { path, token: 'synthetic', signedUrl: `https://storage.invalid/${path}?token=x` },
      error: null,
    }))
    const service = new StorageService()
    const signed = await service.createPrivateUploadUrls('pathways-private', ['a/1.pdf', 'a/2.mp4'])
    await service.createPrivateUploadUrls('pathways-private', ['a/3.mov'])
    expect(signed.map((entry) => entry.path)).toEqual(['a/1.pdf', 'a/2.mp4'])
    expect(provider.createSignedUploadUrl).toHaveBeenCalledWith('a/1.pdf', { upsert: false })
    expect(provider.getBucket).toHaveBeenCalledTimes(2)
    expect(provider.createClient).toHaveBeenCalledTimes(1)
  })

  it('refuses to sign for a public bucket or a mismatched path', async () => {
    provider.getBucket.mockResolvedValue({ data: { public: true }, error: null })
    const service = new StorageService()
    await expect(service.createPrivateUploadUrls('pathways-private', ['a/1.pdf'])).rejects.toThrow(
      /not private/,
    )
    expect(provider.createSignedUploadUrl).not.toHaveBeenCalled()
    provider.getBucket.mockResolvedValue({ data: { public: false }, error: null })
    provider.createSignedUploadUrl.mockResolvedValue({
      data: { path: 'other', token: 't', signedUrl: 'https://storage.invalid/other' },
      error: null,
    })
    await expect(service.createPrivateUploadUrls('pathways-private', ['a/1.pdf'])).rejects.toThrow()
  })

  it('returns no URL for an object that already exists, and still fails on other errors', async () => {
    provider.getBucket.mockResolvedValue({ data: { public: false }, error: null })
    provider.createSignedUploadUrl.mockImplementation(async (path: string) =>
      path === 'a/1.pdf'
        ? { data: null, error: { statusCode: '409', message: 'The resource already exists' } }
        : { data: { path, token: 't', signedUrl: `https://storage.invalid/${path}` }, error: null },
    )
    const service = new StorageService()
    const signed = await service.createPrivateUploadUrls('pathways-private', ['a/1.pdf', 'a/2.pdf'])
    expect(signed).toEqual([
      { path: 'a/1.pdf', uploadUrl: null },
      { path: 'a/2.pdf', uploadUrl: 'https://storage.invalid/a/2.pdf' },
    ])
    provider.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { statusCode: '500', message: 'Internal' },
    })
    await expect(service.createPrivateUploadUrls('pathways-private', ['a/3.pdf'])).rejects.toThrow()
  })
})
