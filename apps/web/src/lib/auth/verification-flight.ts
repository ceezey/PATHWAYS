/** One in-flight verification per owner. No settled result or authority is cached. */
export class VerificationCancelled extends Error {
  constructor() {
    super('Verification was superseded.')
  }
}

export function createVerificationFlight<T>() {
  let active: { key: string; controller: AbortController; promise: Promise<T> } | null = null
  const cancel = () => {
    active?.controller.abort()
    active = null
  }
  const run = (key: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (active?.key === key && !active.controller.signal.aborted) return active.promise
    cancel()
    const controller = new AbortController()
    const promise = Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new VerificationCancelled()
        return task(controller.signal)
      })
      .then((value) => {
        if (controller.signal.aborted) throw new VerificationCancelled()
        return value
      })
    const flight = { key, controller, promise }
    active = flight
    const release = () => {
      if (active === flight) active = null
    }
    void promise.then(release, release)
    return promise
  }
  return { run, cancel }
}
