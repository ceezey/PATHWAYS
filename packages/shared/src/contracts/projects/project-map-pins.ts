import { z } from 'zod'
import { trimmedInput } from '../common/field-schemas'

const placeText = trimmedInput(z.string().min(1).max(120))

/** Names one place of a project, as the map lists it. */
export const mapPinPlaceQuery = z.object({ name: placeText, province: placeText }).strict()

/** Saves a pin's position and lock; the bounds box is the Philippines map area. */
export const saveMapPinRequest = z
  .object({
    name: placeText,
    province: placeText,
    longitude: z.number().min(114).max(128),
    latitude: z.number().min(4).max(22),
    locked: z.boolean(),
  })
  .strict()

export type MapPinPlaceQuery = z.infer<typeof mapPinPlaceQuery>
export type SaveMapPinRequest = z.infer<typeof saveMapPinRequest>
