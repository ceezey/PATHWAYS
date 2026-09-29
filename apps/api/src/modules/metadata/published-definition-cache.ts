/** Process-local, bounded serialized definitions. Never stores authentication decisions. */
export class PublishedDefinitionCache<T> {
  private readonly entries = new Map<
    string,
    { formId: string; json: string; bytes: number; expires: number }
  >()
  private bytes = 0

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly limits = {
      ttlMs: 30_000,
      entries: 64,
      entryBytes: 262_144,
      totalBytes: 4_194_304,
    },
  ) {}

  read(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expires <= this.now()) {
      this.remove(key)
      return undefined
    }
    return JSON.parse(entry.json) as T
  }

  write(key: string, formId: string, value: T): void {
    const json = JSON.stringify(value)
    const bytes = Buffer.byteLength(json, 'utf8') + Buffer.byteLength(key, 'utf8')
    this.remove(key)
    if (bytes > this.limits.entryBytes || bytes > this.limits.totalBytes) return
    const now = this.now()
    for (const [oldKey, entry] of this.entries) if (entry.expires <= now) this.remove(oldKey)
    while (
      this.entries.size >= this.limits.entries ||
      this.bytes + bytes > this.limits.totalBytes
    ) {
      const first = this.entries.keys().next().value
      if (first === undefined) break
      this.remove(first)
    }
    this.entries.set(key, { formId, json, bytes, expires: now + this.limits.ttlMs })
    this.bytes += bytes
  }

  evictForm(formId: string): void {
    for (const [key, entry] of this.entries) if (entry.formId === formId) this.remove(key)
  }

  private remove(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.bytes -= entry.bytes
    this.entries.delete(key)
  }
}
