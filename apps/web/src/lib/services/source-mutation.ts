export type SourceReplayAcknowledgement = { requestId: string; committed: true; replayed: true }
export type SourceMutationResult<T> = T | SourceReplayAcknowledgement
export type SourceMutationContext = { principalKey: string; isCurrent: () => boolean }
export const isSourceReplay = <T>(
  value: SourceMutationResult<T>,
): value is SourceReplayAcknowledgement =>
  typeof value === 'object' &&
  value !== null &&
  'committed' in value &&
  value.committed === true &&
  'replayed' in value &&
  value.replayed === true &&
  'requestId' in value

export function parseSourceMutationResult<T>(
  response: unknown,
  requestId: string,
  parse: (value: unknown) => T,
  allowLegacy = false,
): SourceMutationResult<T> {
  if (response && typeof response === 'object') {
    const keys = Object.keys(response)
    if (
      keys.length === 3 &&
      keys.every((key) => ['requestId', 'committed', 'replayed'].includes(key)) &&
      'requestId' in response &&
      response.requestId === requestId &&
      'committed' in response &&
      response.committed === true &&
      'replayed' in response &&
      response.replayed === true
    )
      return response as SourceReplayAcknowledgement
    if ('sourceAcknowledgement' in response) {
      const { sourceAcknowledgement, ...record } = response
      const receipt = sourceAcknowledgement as Record<string, unknown> | null
      if (
        receipt &&
        typeof receipt === 'object' &&
        Object.keys(receipt).length === 3 &&
        receipt.requestId === requestId &&
        receipt.committed === true &&
        receipt.replayed === false
      )
        return parse(record)
      throw new SourceMutationRecoveryError(
        'The save acknowledgement is invalid. Retry the unchanged input.',
      )
    }
    if (
      allowLegacy &&
      !('requestId' in response) &&
      !('committed' in response) &&
      !('replayed' in response)
    )
      return parse(response)
  }
  throw new SourceMutationRecoveryError(
    'The save outcome could not be confirmed. Retry the unchanged input.',
  )
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PENDING = 32
const MAX_BODY_BYTES = 65536
const RECOVERY_AFTER_MS = 15 * 60 * 1000
export class SourceMutationRecoveryError extends Error {}
type Ticket = {
  id: string
  body: string
  createdAt: number
  pending: boolean
  files?: readonly File[]
  resolution?: 'ABANDONED' | 'COMMITTED'
}
function canonical(value: unknown, depth = 0): unknown {
  if (
    depth > 16 ||
    (typeof value === 'number' && !Number.isFinite(value)) ||
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  )
    throw new SourceMutationRecoveryError('This mutation exceeds supported bounds.')
  if (Array.isArray(value)) return value.map((item) => canonical(item, depth + 1))
  if (
    value &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new SourceMutationRecoveryError('This mutation has an unsupported value.')
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item, depth + 1)]),
    )
  return value
}
/** Ephemeral mutation recovery only. Never caches authentication, grants or domain reads. */
export class SourceMutationTickets {
  private principalKey: string | null = null
  private readonly tickets = new Map<string, Ticket>()
  private readonly listeners = new Set<() => void>()
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private changed() {
    for (const listener of this.listeners) listener()
  }
  constructor(
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly now = () => performance.now(),
  ) {}
  clear() {
    this.tickets.clear()
    this.principalKey = null
    this.changed()
  }
  synchronizePrincipal(principalKey: string | null) {
    if (principalKey !== this.principalKey) {
      this.tickets.clear()
      this.principalKey = principalKey
      this.changed()
    }
  }
  pendingOperations(context: SourceMutationContext, prefix: string) {
    if (!context.isCurrent() || context.principalKey !== this.principalKey) return []
    return [...this.tickets.entries()]
      .filter(([operation]) => operation.slice(operation.indexOf(':') + 1).startsWith(prefix))
      .map(([operation, ticket]) => ({ operation, requestId: ticket.id, pending: ticket.pending }))
  }
  async recover(
    context: SourceMutationContext,
    operation: string,
    send: (input: { requestId: string; body: Record<string, unknown> }) => Promise<unknown>,
  ) {
    const captured =
      context.isCurrent() && this.principalKey === context.principalKey
        ? this.tickets.get(operation)
        : undefined
    if (!captured || captured.pending)
      throw new SourceMutationRecoveryError('This request is unavailable or already in progress.')
    if (captured.resolution) return captured.resolution
    captured.pending = true
    this.changed()
    try {
      const response = await send({ requestId: captured.id, body: JSON.parse(captured.body) })
      if (
        !context.isCurrent() ||
        this.principalKey !== context.principalKey ||
        this.tickets.get(operation) !== captured
      )
        throw new SourceMutationRecoveryError(
          'Recovery ownership changed. Reload the current workspace.',
        )
      if (!response || typeof response !== 'object')
        throw new SourceMutationRecoveryError(
          'Recovery could not be confirmed. Keep the original request.',
        )
      const keys = Object.keys(response)
      const abandoned =
        keys.length === 2 &&
        keys.every((key) => ['requestId', 'abandoned'].includes(key)) &&
        'requestId' in response &&
        response.requestId === captured.id &&
        'abandoned' in response &&
        response.abandoned === true
      const committed =
        keys.length === 3 &&
        keys.every((key) => ['requestId', 'committed', 'replayed'].includes(key)) &&
        'requestId' in response &&
        response.requestId === captured.id &&
        'committed' in response &&
        response.committed === true &&
        'replayed' in response &&
        response.replayed === true
      if (!abandoned && !committed)
        throw new SourceMutationRecoveryError(
          'Recovery could not be confirmed. Keep the original request.',
        )
      captured.resolution = abandoned ? 'ABANDONED' : 'COMMITTED'
      this.changed()
      return captured.resolution
    } finally {
      captured.pending = false
      this.changed()
    }
  }
  finishRecovery(context: SourceMutationContext, operation: string) {
    const ticket =
      context.isCurrent() && this.principalKey === context.principalKey
        ? this.tickets.get(operation)
        : undefined
    if (!ticket?.resolution || ticket.pending)
      throw new SourceMutationRecoveryError(
        'Recovery requires a confirmed outcome and current reload.',
      )
    this.tickets.delete(operation)
    this.changed()
  }
  finishAcknowledgement(context: SourceMutationContext, requestId: string) {
    const operation =
      context.isCurrent() && this.principalKey === context.principalKey
        ? [...this.tickets.entries()].find(
            ([, ticket]) => ticket.id === requestId && ticket.resolution === 'COMMITTED',
          )?.[0]
        : undefined
    if (!operation)
      throw new SourceMutationRecoveryError(
        'The committed request requires its current authorized reload.',
      )
    this.finishRecovery(context, operation)
  }
  pendingRecovery(context: SourceMutationContext, operation: string) {
    const ticket =
      context.isCurrent() && this.principalKey === context.principalKey
        ? this.tickets.get(operation)
        : undefined
    return ticket
      ? { requestId: ticket.id, expired: this.now() - ticket.createdAt >= RECOVERY_AFTER_MS }
      : null
  }
  proofSnapshot(context: SourceMutationContext, operation: string) {
    const ticket =
      context.isCurrent() && this.principalKey === context.principalKey
        ? this.tickets.get(operation)
        : undefined
    return ticket?.files
      ? {
          requestId: ticket.id,
          body: JSON.parse(ticket.body) as { progressPercent: number; note: string },
          files: [...ticket.files],
          committed: ticket.resolution === 'COMMITTED',
        }
      : null
  }
  async execute<T>(
    context: SourceMutationContext,
    operation: string,
    body: Record<string, unknown>,
    send: (body: Record<string, unknown>) => Promise<unknown>,
    parse: (value: unknown) => T,
    options: {
      requestId?: string
      keyField?: 'clientMutationId' | 'clientMeasurementId' | 'clientUpdateId'
      allowLegacy?: boolean
      files?: readonly File[]
    } = {},
  ): Promise<SourceMutationResult<T>> {
    if (!context.isCurrent() || !context.principalKey)
      throw new SourceMutationRecoveryError('Current workspace access is required.')
    if (context.principalKey !== this.principalKey) {
      this.tickets.clear()
      this.principalKey = context.principalKey
    }
    const serialized = JSON.stringify(canonical(body))
    if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES)
      throw new SourceMutationRecoveryError('This mutation exceeds supported bounds.')
    let ticket = this.tickets.get(operation)
    if (ticket?.resolution)
      throw new SourceMutationRecoveryError(
        'Reload the current record to finish recovery before starting another save.',
      )
    if (ticket && ticket.body !== serialized)
      throw new SourceMutationRecoveryError(
        'The earlier save outcome is unresolved. Retry the unchanged input before changing it.',
      )
    if (
      ticket &&
      (ticket.files?.length !== options.files?.length ||
        ticket.files?.some((file, index) => file !== options.files?.[index]))
    )
      throw new SourceMutationRecoveryError(
        'The earlier proof outcome is unresolved. Retry its identical files.',
      )
    if (!ticket) {
      if (this.tickets.size >= MAX_PENDING)
        throw new SourceMutationRecoveryError(
          'Resolve an earlier save before starting another operation.',
        )
      if (
        options.files &&
        (options.files.length < 1 ||
          options.files.length > 5 ||
          options.files.some((file) => file.size > 10 * 1024 * 1024) ||
          options.files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024 ||
          [...this.tickets.values()].reduce(
            (sum, entry) => sum + (entry.files?.reduce((size, file) => size + file.size, 0) ?? 0),
            0,
          ) +
            options.files.reduce((sum, file) => sum + file.size, 0) >
            100 * 1024 * 1024)
      )
        throw new SourceMutationRecoveryError(
          'Resolve an earlier proof or reduce its files before starting another upload.',
        )
      ticket = {
        id: options.requestId ?? this.newId(),
        body: serialized,
        createdAt: this.now(),
        pending: false,
        ...(options.files ? { files: [...options.files] } : {}),
      }
      if (!uuid.test(ticket.id))
        throw new SourceMutationRecoveryError('A valid request identifier is unavailable.')
      this.tickets.set(operation, ticket)
      this.changed()
    }
    if (ticket.pending) throw new SourceMutationRecoveryError('This save is already in progress.')
    ticket.pending = true
    this.changed()
    const captured = ticket
    try {
      if (!context.isCurrent())
        throw new SourceMutationRecoveryError('Current workspace access is required.')
      const response = await send({
        ...JSON.parse(captured.body),
        [options.keyField ?? 'clientMutationId']: captured.id,
      })
      if (
        !context.isCurrent() ||
        this.principalKey !== context.principalKey ||
        this.tickets.get(operation) !== captured
      )
        throw new SourceMutationRecoveryError(
          'Save ownership changed. Reload the current workspace.',
        )
      const result = parseSourceMutationResult(response, captured.id, parse, options.allowLegacy)
      if (isSourceReplay(result)) captured.resolution = 'COMMITTED'
      else this.tickets.delete(operation)
      this.changed()
      return result
    } finally {
      captured.pending = false
      this.changed()
      // Recovery age never clears an unresolved key. A current, unchanged retry may resolve it.
    }
  }
}

export const sourceMutationTickets = new SourceMutationTickets()
