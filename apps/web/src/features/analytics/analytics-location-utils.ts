export type AuthorizedMapPoint = Readonly<{
  id: string
  latitude: number
  longitude: number
  label?: string
}>

export type SafeMapFeature = Readonly<{
  type: 'Feature'
  id: string
  properties: Readonly<{
    id: string
    label?: string
  }>
  geometry: Readonly<{
    type: 'Point'
    coordinates: readonly [longitude: number, latitude: number]
  }>
}>

export type SafeMapFeatureCollection = Readonly<{
  type: 'FeatureCollection'
  features: readonly SafeMapFeature[]
}>

export type SafeMapFeatureResult = Readonly<{
  featureCollection: SafeMapFeatureCollection
  rejectedPointCount: number
}>

export const EMPTY_SAFE_MAP_FEATURE_COLLECTION: SafeMapFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

const isValidCoordinate = (value: number, minimum: number, maximum: number) =>
  Number.isFinite(value) && value >= minimum && value <= maximum

const safeText = (value: string, maximumLength: number) => {
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= maximumLength ? normalized : null
}

export const toSafeMapFeatureCollection = (
  points: readonly AuthorizedMapPoint[],
): SafeMapFeatureResult => {
  const features: SafeMapFeature[] = []
  let rejectedPointCount = 0

  for (const point of points) {
    const id = safeText(point.id, 120)
    const label = point.label === undefined ? undefined : safeText(point.label, 160)
    if (
      id === null ||
      label === null ||
      !isValidCoordinate(point.latitude, -90, 90) ||
      !isValidCoordinate(point.longitude, -180, 180)
    ) {
      rejectedPointCount += 1
      continue
    }

    features.push({
      type: 'Feature',
      id,
      properties: {
        id,
        ...(label === undefined ? {} : { label }),
      },
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude],
      },
    })
  }

  return {
    featureCollection: {
      type: 'FeatureCollection',
      features,
    },
    rejectedPointCount,
  }
}
