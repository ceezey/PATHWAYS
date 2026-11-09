'use client'

import type { MapPinPlaceQuery, SaveMapPinRequest } from '@pathways/shared'
import { useState } from 'react'

import { PathwaysClientError } from '@/lib/api/core/request'
import { projectsClient } from '@/lib/api/projects'

/** How a pin write ended; a locked or invalid pin is final until the person picks again. */
export type MapPinOutcome = 'saved' | 'locked' | 'invalid' | 'failed'

export type MapPinDraft = { longitude: string; latitude: string }

const messages = {
  locked: 'This pin is locked.',
  invalid: 'Pick a spot inside the Philippines map area.',
  failed: 'The pin could not be saved.',
} as const

// The client's fallback when the server sent no message.
const NO_SERVER_MESSAGE = 'The requested operation could not be completed.'

const failure = (caught: unknown): Exclude<MapPinOutcome, 'saved'> =>
  caught instanceof PathwaysClientError && caught.status === 409
    ? 'locked'
    : caught instanceof PathwaysClientError && caught.status === 400
      ? 'invalid'
      : 'failed'

/** Saves and resets one project's map pins; the draft holds the typed or dropped position. */
export const useMapPinEdit = (projectId: string, refetch: () => unknown) => {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState<MapPinDraft>({ longitude: '', latitude: '' })

  const run = async (write: () => Promise<void>): Promise<MapPinOutcome> => {
    setPending(true)
    setError(null)
    let outcome: MapPinOutcome = 'saved'
    try {
      await write()
    } catch (caught) {
      outcome = failure(caught)
      const sent = caught instanceof PathwaysClientError ? caught.message : NO_SERVER_MESSAGE
      // A 409 names its own cause (locked, or changed by someone else), so that text wins.
      setError(outcome === 'locked' && sent !== NO_SERVER_MESSAGE ? sent : messages[outcome])
    }
    // A saved pin and a lock taken by someone else both change the map, so it reloads.
    if (outcome === 'saved' || outcome === 'locked') await refetch()
    setPending(false)
    return outcome
  }

  return {
    save: (input: SaveMapPinRequest) => run(() => projectsClient.saveMapPin(projectId, input)),
    reset: (place: MapPinPlaceQuery) => run(() => projectsClient.resetMapPin(projectId, place)),
    clearError: () => setError(null),
    draft,
    setDraft,
    error,
    pending,
  }
}
