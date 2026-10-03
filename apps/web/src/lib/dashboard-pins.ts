/** Browser-only dashboard pins: references to a view, never data; data is re-fetched under live permissions. */

export const PIN_VIEWS = ['kpi', 'participation', 'trends', 'budget', 'saddd', 'timeline'] as const
export type PinView = (typeof PIN_VIEWS)[number]

export interface DashboardPin {
  id: string
  view: PinView
  projectId: string
  projectName: string
  periodStart?: string
  periodEnd?: string
  createdAt: string
}

export const MAX_DASHBOARD_PINS = 8

const storageKey = (userId: string) => `pathways.dashboardPins.v1.${userId}`
const pinKey = (pin: Pick<DashboardPin, 'view' | 'projectId' | 'periodStart' | 'periodEnd'>) =>
  [pin.view, pin.projectId, pin.periodStart ?? '', pin.periodEnd ?? ''].join('|')

const isPin = (value: unknown): value is DashboardPin => {
  const pin = value as DashboardPin
  return (
    typeof pin === 'object' &&
    pin !== null &&
    typeof pin.id === 'string' &&
    PIN_VIEWS.includes(pin.view) &&
    typeof pin.projectId === 'string' &&
    typeof pin.projectName === 'string' &&
    typeof pin.createdAt === 'string' &&
    (pin.periodStart === undefined || typeof pin.periodStart === 'string') &&
    (pin.periodEnd === undefined || typeof pin.periodEnd === 'string')
  )
}

/** Unavailable or corrupt storage reads as no pins. */
export function readPins(userId: string): DashboardPin[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isPin).slice(0, MAX_DASHBOARD_PINS) : []
  } catch {
    return []
  }
}

function writePins(userId: string, pins: DashboardPin[]): boolean {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(pins))
    return true
  } catch {
    return false
  }
}

export type AddPinResult = 'added' | 'duplicate' | 'full' | 'unavailable'

export function addPin(
  userId: string,
  input: Omit<DashboardPin, 'id' | 'createdAt'>,
): AddPinResult {
  const pins = readPins(userId)
  if (pins.some((pin) => pinKey(pin) === pinKey(input))) return 'duplicate'
  if (pins.length >= MAX_DASHBOARD_PINS) return 'full'
  const pin: DashboardPin = {
    id: crypto.randomUUID(),
    view: input.view,
    projectId: input.projectId,
    projectName: input.projectName,
    ...(input.periodStart && input.periodEnd
      ? { periodStart: input.periodStart, periodEnd: input.periodEnd }
      : {}),
    createdAt: new Date().toISOString(),
  }
  return writePins(userId, [...pins, pin]) ? 'added' : 'unavailable'
}

export function removePin(userId: string, id: string): boolean {
  return writePins(
    userId,
    readPins(userId).filter((pin) => pin.id !== id),
  )
}
