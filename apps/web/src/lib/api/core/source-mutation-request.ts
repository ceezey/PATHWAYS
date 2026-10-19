import {
  type SourceMutationContext,
  SourceMutationRecoveryError,
  type SourceMutationResult,
  sourceMutationTickets,
} from '@/lib/api/core/source-mutation'
import { PathwaysClientError, requestFoundation } from './request'

/** Sends an owned source mutation through the recovery tickets and maps a recovery fault to a client error. */
export async function requestSourceMutation<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
  context: SourceMutationContext | undefined,
  parse: (value: unknown) => T,
): Promise<SourceMutationResult<T>> {
  if (!context)
    throw new PathwaysClientError('Current mutation ownership is required.', 'unauthorized')
  try {
    return await sourceMutationTickets.execute(
      context,
      `${method}:${path}`,
      body,
      (captured) =>
        requestFoundation(path, { method, body: JSON.stringify(captured) }, context.isCurrent),
      parse,
    )
  } catch (error) {
    if (error instanceof SourceMutationRecoveryError)
      throw new PathwaysClientError(error.message, 'invalid')
    throw error
  }
}
