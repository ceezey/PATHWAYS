import { ServiceUnavailableException } from '@nestjs/common'

/** A pool wait, transaction expiry or statement timeout, kept distinct from schema or scope faults. */
export function databaseBusyError() {
  return new ServiceUnavailableException({
    message: 'The server is busy and the request ran out of time. Retry shortly.',
    code: 'DATABASE_BUSY',
  })
}
