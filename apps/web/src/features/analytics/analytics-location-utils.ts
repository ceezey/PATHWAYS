export type ProjectCoverageScope = Readonly<{
  id: string
  title: string
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

export const EMPTY_SAFE_MAP_FEATURE_COLLECTION: SafeMapFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

/**
 * Contract B: the persisted Project/API contract has no authoritative coordinates.
 * Keep the selected Project boundary explicit without deriving points from text locations.
 */
export const toProjectCoverageFeatureCollection = (
  _project: ProjectCoverageScope | null | undefined,
): SafeMapFeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
})
