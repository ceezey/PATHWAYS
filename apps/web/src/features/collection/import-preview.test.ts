import { toWorkbookBytes } from '@pathways/imports'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseImportPreview, parseImportPreviewRequest } from './import-preview'

const workbookFile = () =>
  new File(
    [
      new Uint8Array(
        toWorkbookBytes(
          [
            ['code', 'score'],
            ['BEN-1', '4'],
          ],
          'xlsx',
        ),
      ),
    ],
    'scores.xlsx',
  )

describe('import preview parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses CSV and workbooks into the preview shape', async () => {
    expect(parseImportPreviewRequest({ kind: 'csv', text: 'code,score\nBEN-1,4\n' })).toEqual({
      fileType: 'csv',
      headers: ['code', 'score'],
      rows: [{ code: 'BEN-1', score: '4' }],
      errors: [],
    })
    const buffer = await workbookFile().arrayBuffer()
    expect(parseImportPreviewRequest({ kind: 'workbook', buffer })).toEqual({
      fileType: 'xlsx',
      headers: ['code', 'score'],
      rows: [{ code: 'BEN-1', score: '4' }],
      errors: [],
      sheetNames: ['PATHWAYS'],
    })
  })

  it('runs the parse in a Web Worker and transfers the workbook bytes', async () => {
    const posted: Array<{ message: unknown; transfer?: Transferable[] }> = []
    let created: URL | undefined
    let terminated = false
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      constructor(url: URL) {
        created = url
      }
      postMessage(message: { kind: string; buffer?: ArrayBuffer }, transfer?: Transferable[]) {
        posted.push({ message, transfer })
        queueMicrotask(() =>
          this.onmessage?.({
            data: { ok: true, result: parseImportPreviewRequest(message as never) },
          } as MessageEvent),
        )
      }
      terminate() {
        terminated = true
      }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('window', globalThis)

    const result = await parseImportPreview(workbookFile())

    expect(String(created)).toContain('import-preview.worker')
    expect(posted).toHaveLength(1)
    expect(posted[0].transfer?.[0]).toBeInstanceOf(ArrayBuffer)
    expect(result.headers).toEqual(['code', 'score'])
    expect(terminated).toBe(true)
  })

  it('surfaces a worker parse failure as a readable error', async () => {
    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      postMessage() {
        queueMicrotask(() =>
          this.onmessage?.({
            data: { ok: false, message: 'Unreadable workbook.' },
          } as MessageEvent),
        )
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FailingWorker)
    vi.stubGlobal('window', globalThis)
    await expect(parseImportPreview(workbookFile())).rejects.toThrow('Unreadable workbook.')
  })

  it('parses on the main thread where Worker is unavailable', async () => {
    const result = await parseImportPreview(new File(['code\nBEN-1\n'], 'codes.csv'))
    expect(result).toMatchObject({ fileType: 'csv', headers: ['code'] })
  })

  it('rejects unsupported extensions before reading the file', async () => {
    const file = new File(['%PDF-1.4'], 'register.pdf')
    const read = vi.spyOn(file, 'arrayBuffer')
    await expect(parseImportPreview(file)).rejects.toThrow('Choose a CSV, XLS, or XLSX file.')
    expect(read).not.toHaveBeenCalled()
  })
})
