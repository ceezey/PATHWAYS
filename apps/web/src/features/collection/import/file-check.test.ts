import { type FileCheckReport, toWorkbookBytes } from '@pathways/imports'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DigitalFormDefinition } from '@/types/pathways'

import { runFileCheck } from './file-check'

const form = { formType: 'ACTIVITY', fields: [] } as unknown as DigitalFormDefinition
const workbookFile = () =>
  new File([new Uint8Array(toWorkbookBytes([['Name'], ['Ana']], 'xlsx'))], 'people.xlsx')
const report: FileCheckReport = { totalRows: 1, problemRows: 1, problems: [] }

describe('runFileCheck in a Web Worker', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('runs the check in a worker and transfers the file bytes', async () => {
    const posted: Array<{ transfer?: Transferable[] }> = []
    let created: URL | undefined
    let terminated = false
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      constructor(url: URL) {
        created = url
      }
      postMessage(_message: unknown, transfer?: Transferable[]) {
        posted.push({ transfer })
        queueMicrotask(() => this.onmessage?.({ data: report } as MessageEvent))
      }
      terminate() {
        terminated = true
      }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('window', globalThis)

    await expect(runFileCheck(workbookFile(), form, '')).resolves.toBe(report)
    expect(String(created)).toContain('file-check.worker')
    expect(posted[0].transfer?.[0]).toBeInstanceOf(ArrayBuffer)
    expect(terminated).toBe(true)
  })

  it('skips the check when the worker fails', async () => {
    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      postMessage() {
        queueMicrotask(() => this.onerror?.())
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FailingWorker)
    vi.stubGlobal('window', globalThis)
    await expect(runFileCheck(workbookFile(), form, '')).resolves.toBeNull()
  })

  it('skips the check when the worker takes too long', async () => {
    let terminated = false
    class SilentWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      postMessage() {}
      terminate() {
        terminated = true
      }
    }
    vi.stubGlobal('Worker', SilentWorker)
    vi.stubGlobal('window', globalThis)
    vi.useFakeTimers()
    const result = runFileCheck(workbookFile(), form, '')
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(result).resolves.toBeNull()
    expect(terminated).toBe(true)
  })
})
