// Fixed projection only: acknowledgement does not mean every queued job finished.
export type MachineAcknowledgement = Readonly<{ state: 'ACKNOWLEDGED' }>
export function machineAcknowledgement(): MachineAcknowledgement {
  return Object.freeze({ state: 'ACKNOWLEDGED' })
}
