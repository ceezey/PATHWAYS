import { useSyncExternalStore } from 'react'

const user = { id: 'f5b3709a-4f66-4bdb-a6c3-f0ca4076e459' }
const initialSession = { access_token: 'synthetic-monitoring-token', user }
const initialProfile = {
  id: '910042ae-5870-47a9-a0c0-f25ef396acc7',
  userId: user.id,
  organizationId: '4c9fbd57-f74b-4193-8bd2-251b459d6142',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['dashboards.read'],
  assignedProjectIds: ['29964679-b84c-4f94-9c14-77e3cea3d636'],
}

let state = {
  session: initialSession as typeof initialSession | null,
  profile: initialProfile as typeof initialProfile | null,
  access: 'ready',
  project: 'project-a',
}
const listeners = new Set<() => void>()
window.addEventListener('monitoring-authority', (event) => {
  state = { ...state, ...(event as CustomEvent).detail }
  for (const listener of listeners) listener()
})
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const snapshot = () => state
export const useCurrentRole = () => {
  const value = useSyncExternalStore(subscribe, snapshot)
  return { profile: value.profile, access: value.access }
}
export const useSession = () => ({ session: useSyncExternalStore(subscribe, snapshot).session })
export const useFixtureProject = () => useSyncExternalStore(subscribe, snapshot).project
