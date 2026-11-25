export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Apart from the map component so the middleware can allow the tile origin without loading MapLibre.
export const resolveMapStyleUrl = (configuredStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL) =>
  configuredStyleUrl?.trim() || DEFAULT_MAP_STYLE_URL
